const fs = require('fs')
const os = require('os')
const path = require('path')
const AdmZip = require('adm-zip')

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(({ params }) => ({ done: () => global.__uploadImpl(params) })),
}))
jest.mock('../../src/services/storage.service', () => ({ getObjectBuffer: jest.fn() }))
jest.mock('../../src/config/r2', () => ({ getR2Client: jest.fn() }))

const { Upload } = require('@aws-sdk/lib-storage')
const { getR2Client } = require('../../src/config/r2')
const publish = require('../../src/services/publish.service')

const zipOf = (files) => {
  const zip = new AdmZip()
  for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content))
  return zip.toBuffer()
}

const BUILD = zipOf({
  'MiJuego/index.html': '<html><head></head><body></body></html>',
  'MiJuego/manifest.webmanifest': '{}',
  'MiJuego/Build/Juego.wasm': 'wasm',
  'MiJuego/TemplateData/style.css': 'css',
  '__MACOSX/._x': 'meta',
})

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'))
  process.env.PUBLIC_FILES_DIR = dir
  delete process.env.R2_BUCKET
  global.__uploadImpl = async () => {}
  Upload.mockClear()
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('publishBuild (carpeta local)', () => {
  it('publica los archivos desde la raíz del build, con el script de progreso en index.html', async () => {
    const { ruta_publica, manifiesto } = await publish.publishBuild(BUILD)

    expect(ruta_publica).toMatch(/^builds\/[0-9a-f-]{36}\/$/)
    const base = path.join(dir, ruta_publica)
    expect(fs.readFileSync(path.join(base, 'Build/Juego.wasm'), 'utf8')).toBe('wasm')
    expect(fs.readFileSync(path.join(base, 'index.html'), 'utf8')).toContain("source = 'gameploy-player'")
    expect(fs.existsSync(path.join(base, '__MACOSX'))).toBe(false)
    expect(manifiesto).toMatchObject({ root: 'MiJuego/', pwa: true, compressed: false })
    expect(manifiesto.files.map(f => f.path)).toContain('Build/Juego.wasm')
  })

  it('cada publicación usa una carpeta nueva', async () => {
    const a = await publish.publishBuild(BUILD)
    const b = await publish.publishBuild(BUILD)

    expect(a.ruta_publica).not.toBe(b.ruta_publica)
  })

  it('rechaza un .zip sin index.html', async () => {
    await expect(publish.publishBuild(zipOf({ 'Build/x.wasm': 'w' }))).rejects.toMatchObject({ statusCode: 422 })
  })

  it('publica imágenes con un nombre seguro y las borra por su prefijo', async () => {
    const { ruta_publica } = await publish.publishImage(Buffer.from('png'), 'Mi Portada (1).png', 'image/png')

    expect(ruta_publica).toMatch(/^media\/[0-9a-f-]{36}\/Mi-Portada-1-\.png$/)
    expect(fs.existsSync(path.join(dir, ruta_publica))).toBe(true)

    await publish.removePublished(ruta_publica)
    expect(fs.existsSync(path.join(dir, path.dirname(ruta_publica)))).toBe(false)
  })
})

describe('publishBuild (R2)', () => {
  beforeEach(() => {
    process.env.R2_BUCKET = 'gameploy-files'
    process.env.CDN_URL = 'https://cdn.test'
    process.env.CDN_SIGNING_SECRET = 's'
  })
  afterEach(() => {
    delete process.env.R2_BUCKET
    delete process.env.CDN_URL
    delete process.env.CDN_SIGNING_SECRET
  })

  it('sube cada archivo con su tipo y su caché: index.html corta, el resto inmutable', async () => {
    const uploads = []
    global.__uploadImpl = async (params) => { uploads.push(params) }

    await publish.publishBuild(BUILD)

    const byFile = Object.fromEntries(uploads.map(u => [u.Key.split('/').slice(2).join('/'), u]))
    expect(byFile['Build/Juego.wasm']).toMatchObject({
      Bucket: 'gameploy-files', ContentType: 'application/wasm', CacheControl: 'public, max-age=31536000, immutable',
    })
    expect(byFile['index.html']).toMatchObject({ ContentType: 'text/html; charset=utf-8', CacheControl: 'public, max-age=300' })
  })

  it('si una subida falla, borra lo ya publicado y propaga el error', async () => {
    const send = jest.fn(async (cmd) => (cmd.constructor.name === 'ListObjectsV2Command'
      ? { Contents: [{ Key: 'builds/x/index.html' }], IsTruncated: false }
      : {}))
    getR2Client.mockReturnValue({ send })
    global.__uploadImpl = async (params) => { if (params.Key.endsWith('.wasm')) throw new Error('R2 caído') }

    await expect(publish.publishBuild(BUILD)).rejects.toThrow('R2 caído')
    expect(send.mock.calls.map(c => c[0].constructor.name)).toEqual(['ListObjectsV2Command', 'DeleteObjectsCommand'])
  })
})
