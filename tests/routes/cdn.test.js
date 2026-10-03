const fs = require('fs')
const os = require('os')
const path = require('path')
const request = require('supertest')

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({})) }))
jest.mock('firebase-admin', () => ({
  apps: [{}], initializeApp: jest.fn(), credential: { cert: jest.fn() }, auth: () => ({ verifyIdToken: jest.fn() }),
}))

const app = require('../../src/app')
const { signedUrl } = require('../../src/utils/cdnToken')
const { getPublicFilesConfig } = require('../../src/config/publicFiles')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdn-'))
  process.env.PUBLIC_FILES_DIR = dir
  fs.mkdirSync(path.join(dir, 'builds/b1/Build'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'builds/b1/index.html'), '<html>juego</html>')
  fs.writeFileSync(path.join(dir, 'builds/b1/Build/x.wasm'), 'wasm')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** Ruta relativa a la API de un enlace firmado por la configuración local. */
const linkPath = (prefix, file, nowMs) => {
  const cfg = getPublicFilesConfig()
  const url = signedUrl({ baseUrl: cfg.cdnUrl, secret: cfg.signingSecret, prefix, file, nowMs })
  return new URL(url).pathname
}

describe('CDN local de desarrollo', () => {
  it('sirve los archivos publicados con un enlace firmado', async () => {
    const res = await request(app).get(linkPath('builds/b1/', 'index.html'))

    expect(res.status).toBe(200)
    expect(res.text).toBe('<html>juego</html>')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
  })

  it('marca como inmutables los archivos del build', async () => {
    const res = await request(app).get(linkPath('builds/b1/', 'Build/x.wasm'))

    expect(res.headers['content-type']).toBe('application/wasm')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('niega enlaces sin firma, alterados o vencidos', async () => {
    const valid = linkPath('builds/b1/', 'index.html')

    expect((await request(app).get('/api/v1/cdn/builds/b1/index.html')).status).toBe(404)
    expect((await request(app).get(valid.replace('/builds/b1/', '/builds/b2/'))).status).toBe(403)
    expect((await request(app).get(linkPath('builds/b1/', 'index.html', Date.now() - 3 * 3600 * 1000))).status).toBe(403)
  })

  it('no existe con R2 configurado: ahí sirve el Worker', async () => {
    process.env.R2_BUCKET = 'b'
    process.env.CDN_URL = 'https://cdn.test'
    process.env.CDN_SIGNING_SECRET = 's'
    try {
      expect((await request(app).get('/api/v1/cdn/t/1.aaaaaaaaaaaaaaaaaaaaaaaa/builds/b1/index.html')).status).toBe(404)
    } finally {
      delete process.env.R2_BUCKET
      delete process.env.CDN_URL
      delete process.env.CDN_SIGNING_SECRET
    }
  })
})
