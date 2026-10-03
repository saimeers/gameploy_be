const request = require('supertest')
const AdmZip = require('adm-zip')

const mockPrisma = { archivo: { findFirst: jest.fn() } }

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => ({ verifyIdToken: jest.fn() }),
}))
jest.mock('../../src/services/storage.service', () => ({
  getObjectBuffer: jest.fn(),
  getPresignedUrl: jest.fn(),
  deleteFile: jest.fn(),
  uploadFile: jest.fn(),
  buildStorageKey: jest.fn(),
}))

const { getObjectBuffer } = require('../../src/services/storage.service')
const play = require('../../src/services/play.service')
const app = require('../../src/app')

const ARCHIVO = { id: 'file-1', ruta_storage: 'k/game.zip', fecha_subida: new Date('2026-10-01T10:00:00Z') }
const URL = '/api/v1/play/p1/v1'

beforeEach(() => {
  play._resetForTests()
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<html><head></head><body>juego</body></html>'))
  zip.addFile('Build/Juego.wasm', Buffer.from('wasm-bytes'))
  getObjectBuffer.mockResolvedValue(zip.toBuffer())
  mockPrisma.archivo.findFirst.mockResolvedValue(ARCHIVO)
})

describe('GET /play/:projectId/:versionId/*', () => {
  it('sirve el index.html con el script de progreso inyectado', async () => {
    const res = await request(app).get(`${URL}/index.html`)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/html/)
    expect(res.text).toContain("source = 'gameploy-player'")
    expect(res.text).toContain('<body>juego</body>')
  })

  it('sirve el resto de archivos tal cual, con su tipo y cabeceras de caché', async () => {
    const res = await request(app).get(`${URL}/Build/Juego.wasm`).responseType('blob')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/wasm')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['cache-control']).toBe('public, no-cache')
    expect(res.headers.etag).toMatch(/^"file-1-\d+"$/)
    expect(res.body.toString()).toBe('wasm-bytes')
  })

  it('responde 304 sin abrir el .zip si el navegador ya tiene la versión', async () => {
    const first = await request(app).get(`${URL}/Build/Juego.wasm`)
    getObjectBuffer.mockClear()
    play._resetForTests()

    const res = await request(app)
      .get(`${URL}/Build/Juego.wasm`)
      .set('If-None-Match', first.headers.etag)

    expect(res.status).toBe(304)
    expect(getObjectBuffer).not.toHaveBeenCalled()
  })

  it('busca el build solo dentro del proyecto de la URL', async () => {
    await request(app).get(`${URL}/index.html`)

    expect(mockPrisma.archivo.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id_version: 'v1', tipo: 'juego_webgl', version: { id_proyecto: 'p1' } },
    }))
  })

  it('responde 404 si la versión no tiene juego o el archivo no está en el .zip', async () => {
    expect((await request(app).get(`${URL}/Build/otro.js`)).status).toBe(404)

    mockPrisma.archivo.findFirst.mockResolvedValue(null)
    expect((await request(app).get(`${URL}/index.html`)).status).toBe(404)
  })

  it('no cuenta los archivos del juego en el límite global de peticiones', async () => {
    const res = await request(app).get(`${URL}/Build/Juego.wasm`)

    expect(res.headers['ratelimit-remaining']).toBeUndefined()
  })
})
