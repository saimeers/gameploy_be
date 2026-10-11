const request = require('supertest')

const mockPrisma = {
  proyecto: { findUnique: jest.fn() },
  slugAnterior: { findUnique: jest.fn() },
  archivo: { findFirst: jest.fn() },
}

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
jest.mock('geoip-lite', () => ({ lookup: () => null }))

const app = require('../../src/app')
const cache = require('../../src/services/cache.service')

beforeEach(() => {
  cache._resetForTests()
  jest.clearAllMocks()
})

// A path scanner once saturated the origin because /play ran a database query
// per request and was exempt from the rate limiter. Every build now has a
// published copy on the CDN, so the route was removed outright.
describe('la ruta heredada /play ya no existe', () => {
  it('responde 404 sin consultar la base de datos', async () => {
    const res = await request(app).get('/api/v1/play/p1/v1/index.html')

    expect(res.status).toBe(404)
    expect(mockPrisma.archivo.findFirst).not.toHaveBeenCalled()
  })
})

// The slug is the cache key and reaches the database, so a burst of random
// slugs would create one Redis entry and one query per value.
describe('GET /public/games/:slug valida la forma del slug', () => {
  it('rechaza un slug con caracteres inválidos sin tocar caché ni base de datos', async () => {
    const res = await request(app).get('/api/v1/public/games/..%2Fetc%2Fpasswd')

    expect(res.status).toBe(404)
    expect(mockPrisma.proyecto.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.slugAnterior.findUnique).not.toHaveBeenCalled()
  })

  it('rechaza un slug demasiado corto', async () => {
    const res = await request(app).get('/api/v1/public/games/ab')

    expect(res.status).toBe(404)
    expect(mockPrisma.proyecto.findUnique).not.toHaveBeenCalled()
  })

  it('deja pasar un slug con la forma correcta', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/v1/public/games/memoria-visual-x7k2')

    expect(res.status).toBe(404)
    // Este sí llega a consultarse: la forma es válida, el proyecto no existe.
    expect(mockPrisma.proyecto.findUnique).toHaveBeenCalled()
  })
})

// The spec is a complete map of every route and its payloads: reconnaissance
// handed to whoever asks for it.
describe('la documentación Swagger no se publica en producción', () => {
  const realEnv = process.env.NODE_ENV
  const realFlag = process.env.ENABLE_API_DOCS
  afterEach(() => {
    process.env.NODE_ENV = realEnv
    if (realFlag === undefined) delete process.env.ENABLE_API_DOCS
    else process.env.ENABLE_API_DOCS = realFlag
  })

  /** app.js decides at load time, so each case needs its own module instance. */
  const freshApp = () => {
    let instance
    jest.isolateModules(() => { instance = require('../../src/app') })
    return instance
  }

  it('en producción responde 404', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ENABLE_API_DOCS

    const res = await request(freshApp()).get('/api/docs/')

    expect(res.status).toBe(404)
  })

  it('en desarrollo sigue disponible', async () => {
    process.env.NODE_ENV = 'development'

    const res = await request(freshApp()).get('/api/docs/')

    expect(res.status).toBe(200)
  })

  it('en producción se puede habilitar a propósito', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ENABLE_API_DOCS = 'true'

    const res = await request(freshApp()).get('/api/docs/')

    expect(res.status).toBe(200)
  })
})
