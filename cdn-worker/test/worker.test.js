import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import worker from '../src/index.js'
import { parsePath, verifySignature } from '../src/token.js'

// La API firma con node:crypto (src/utils/cdnToken.js); el Worker verifica con
// WebCrypto. Usar el código real de la API asegura que ambos lados coinciden.
const require = createRequire(import.meta.url)
const { signedUrl, tokenExpiry, signature } = require('../../src/utils/cdnToken.js')

const SECRET = 'secreto-de-prueba'
const BASE = 'https://cdn.test'

// ── Simulaciones de R2 y de la caché de Cloudflare
let objects
let cacheStore
let bucketReads
const env = {
  CDN_SIGNING_SECRET: SECRET,
  BUCKET: {
    async get(key) {
      bucketReads++
      const object = objects[key]
      if (!object) return null
      return {
        body: object.body,
        httpEtag: `"etag-${key}"`,
        writeHttpMetadata(headers) {
          headers.set('content-type', object.type)
          headers.set('cache-control', 'public, max-age=31536000, immutable')
        },
      }
    },
  },
}
globalThis.caches = {
  default: {
    async match(req) { return cacheStore.get(req.url)?.clone() },
    async put(req, res) { cacheStore.set(req.url, res) },
  },
}
const pending = []
const ctx = { waitUntil: p => pending.push(p) }
const fetchUrl = async (url, init) => {
  const res = await worker.fetch(new Request(url, init), env, ctx)
  await Promise.all(pending.splice(0))
  return res
}

const link = (prefix, file, nowMs) => signedUrl({ baseUrl: BASE, secret: SECRET, prefix, file, nowMs })

beforeEach(() => {
  objects = {
    'builds/abc/index.html': { body: '<html>juego</html>', type: 'text/html; charset=utf-8' },
    'builds/abc/Build/Juego.wasm': { body: 'wasm', type: 'application/wasm' },
    'builds/otro/index.html': { body: '<html>otro</html>', type: 'text/html' },
    'media/img1/portada.png': { body: 'png', type: 'image/png' },
  }
  cacheStore = new Map()
  bucketReads = 0
})

test('sirve un archivo con una firma válida', async () => {
  const res = await fetchUrl(link('builds/abc/', 'index.html'))

  assert.equal(res.status, 200)
  assert.equal(await res.text(), '<html>juego</html>')
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
})

test('las rutas relativas del juego heredan el token', async () => {
  const index = link('builds/abc/', 'index.html')
  const wasm = new URL('Build/Juego.wasm', index).href

  const res = await fetchUrl(wasm)

  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'wasm')
})

test('un token de un juego no abre otro', async () => {
  const forged = link('builds/abc/', 'index.html').replace('/builds/abc/', '/builds/otro/')

  assert.equal((await fetchUrl(forged)).status, 403)
})

test('rechaza firmas alteradas y tokens vencidos', async () => {
  const valid = new URL(link('builds/abc/', 'index.html'))
  const [, t, token, ...rest] = valid.pathname.split('/')
  const [exp, sig] = token.split('.')
  const flipped = `${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`
  const tampered = `${valid.origin}/${t}/${exp}.${flipped}/${rest.join('/')}`
  const expired = link('builds/abc/', 'index.html', Date.now() - 3 * 60 * 60 * 1000)

  assert.equal((await fetchUrl(tampered)).status, 403)
  assert.equal((await fetchUrl(expired)).status, 403)
})

test('sin secreto configurado no sirve nada, ni con firmas hechas sin secreto', async () => {
  const saved = env.CDN_SIGNING_SECRET
  delete env.CDN_SIGNING_SECRET
  try {
    const url = new URL(link('builds/abc/', 'index.html'))
    const exp = url.pathname.split('/')[2].split('.')[0]
    for (const guess of ['', 'undefined']) {
      const sig = signature(guess, 'builds/abc/', Number(exp))
      const forged = `${BASE}/t/${exp}.${sig}/builds/abc/index.html`
      assert.equal((await fetchUrl(forged)).status, 403)
    }
    assert.equal((await fetchUrl(url.href)).status, 403)
    assert.equal(bucketReads, 0)
  } finally {
    env.CDN_SIGNING_SECRET = saved
  }
})

test('sin token o fuera de builds/ y media/ responde 404', async () => {
  assert.equal((await fetchUrl(`${BASE}/builds/abc/index.html`)).status, 404)
  const exp = tokenExpiry()
  const sig = signature(SECRET, 'secret/abc/', exp)
  assert.equal((await fetchUrl(`${BASE}/t/${exp}.${sig}/secret/abc/x`)).status, 404)
})

test('no permite salir del prefijo con ..', async () => {
  const exp = tokenExpiry()
  const sig = signature(SECRET, 'builds/abc/', exp)

  // El parser de URL resuelve %2E%2E como "..": la ruta cae en otro prefijo,
  // cuya firma no coincide, y nunca se lee el objeto de R2.
  const res = await fetchUrl(`${BASE}/t/${exp}.${sig}/builds/abc/%2E%2E/otro/index.html`)

  assert.ok([403, 404].includes(res.status))
  assert.equal(bucketReads, 0)
  assert.equal(parsePath('/t/1.aaaaaaaaaaaaaaaaaaaaaaaa/builds/abc/../x'), null)
})

test('la segunda petición sale de la caché, aunque llegue con otro token', async () => {
  const first = await fetchUrl(link('media/img1/', 'portada.png'))
  const later = link('media/img1/', 'portada.png', Date.now() + 2 * 60 * 60 * 1000)

  const res = await fetchUrl(later)

  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'png')
  assert.equal(bucketReads, 1)
  assert.equal(first.headers.get('x-cache'), 'MISS')
  assert.equal(res.headers.get('x-cache'), 'HIT')
  // La copia guardada no arrastra la marca de la primera respuesta
  assert.equal(cacheStore.values().next().value.headers.get('x-cache'), null)
})

test('responde 304 si el navegador ya tiene el archivo', async () => {
  const url = link('media/img1/', 'portada.png')
  const first = await fetchUrl(url)

  const res = await fetchUrl(url, { headers: { 'If-None-Match': first.headers.get('etag') } })

  assert.equal(res.status, 304)
})

test('404 si el objeto no existe y 405 para métodos que no son de lectura', async () => {
  assert.equal((await fetchUrl(link('builds/abc/', 'no-existe.js'))).status, 404)
  assert.equal((await fetchUrl(link('builds/abc/', 'index.html'), { method: 'POST' })).status, 405)
})

test('parsePath y verifySignature aceptan exactamente lo que firma la API', async () => {
  const url = new URL(link('builds/abc/', 'Build/Juego.wasm'))
  const target = parsePath(url.pathname)

  assert.equal(target.prefix, 'builds/abc/')
  assert.equal(target.key, 'builds/abc/Build/Juego.wasm')
  assert.equal(await verifySignature(SECRET, target), true)
  assert.equal(await verifySignature('otro-secreto', target), false)
})
