const request = require('supertest')

const mockPrisma = {
  proyecto: { findUnique: jest.fn() },
  slugAnterior: { findUnique: jest.fn() },
  usuario: { findUnique: jest.fn() },
  visita: { create: jest.fn() },
}
const mockVerifyIdToken = jest.fn()

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
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

const BUILD = {
  id: 'a1', tipo: 'juego_webgl', nombre_archivo: 'game.zip',
  ruta_storage: 'proyectos/p1/v1/game.zip', ruta_publica: 'builds/b1/', manifiesto: { files: [] },
}
const COVER = {
  id: 'a2', tipo: 'portada', nombre_archivo: 'portada.png',
  ruta_storage: 'proyectos/p1/v1/portada.png', ruta_publica: 'media/m1/portada.png',
}

let project
const page = (headers = {}) => request(app).get('/api/v1/public/games/memoria').set(headers)

beforeEach(() => {
  process.env.PUBLIC_FILES_DIR = '/tmp/gameploy-public-test'
  cache._resetForTests()
  project = {
    id: 'p1', slug: 'memoria', id_usuario: 'u1', estado: 'publicado', visibilidad: 'publico',
    versiones: [{ id: 'v1', archivos: [{ ...BUILD }, { ...COVER }] }],
  }
  mockPrisma.proyecto.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.slug ? { id: 'p1' } : JSON.parse(JSON.stringify(project))))
  mockPrisma.visita.create.mockResolvedValue({})
})

describe('GET /public/games/:slug', () => {
  it('a un proyecto público le añade los enlaces firmados y oculta las rutas internas', async () => {
    const res = await page()

    expect(res.status).toBe(200)
    const [build, cover] = res.body.data.versiones[0].archivos
    expect(build.play_url).toMatch(/\/cdn\/t\/\d+\.[\w-]+\/builds\/b1\/index\.html$/)
    expect(cover.url).toMatch(/\/cdn\/t\/\d+\.[\w-]+\/media\/m1\/portada\.png$/)
    expect(JSON.stringify(res.body)).not.toMatch(/ruta_storage|ruta_publica|manifiesto|proyectos\/p1/)
  })

  it('por enlace: lo abre quien tenga el slug', async () => {
    project.visibilidad = 'por_enlace'

    const res = await page()

    expect(res.status).toBe(200)
    expect(res.body.data.versiones[0].archivos[0].play_url).toBeDefined()
  })

  it('privado: sin sesión responde 403 y no entrega ningún enlace', async () => {
    project.visibilidad = 'privado'

    const res = await page()

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('private')
    expect(JSON.stringify(res.body)).not.toMatch(/cdn|builds|media/)
  })

  it('privado: otro usuario recibe 403; el dueño y el admin lo ven', async () => {
    project.visibilidad = 'privado'
    mockVerifyIdToken.mockResolvedValue({ uid: 'firebase-x' })
    const auth = { Authorization: 'Bearer token' }

    mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u2', rol: { nombre: 'estudiante' } })
    expect((await page(auth)).status).toBe(403)

    mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1', rol: { nombre: 'estudiante' } })
    expect((await page(auth)).status).toBe(200)

    mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'a9', rol: { nombre: 'admin' } })
    expect((await page(auth)).status).toBe(200)
  })

  it('un borrador no se muestra ni con el enlace', async () => {
    project.estado = 'borrador'

    const res = await page()

    expect(res.status).toBe(403)
    expect(JSON.stringify(res.body)).not.toMatch(/cdn|builds|media/)
  })

  it('usa la caché, pero los enlaces se firman en cada respuesta', async () => {
    await page()
    const res = await page()

    expect(mockPrisma.proyecto.findUnique).toHaveBeenCalledTimes(2) // slug + proyecto, una sola vez
    expect(res.body.data.versiones[0].archivos[0].play_url).toBeDefined()
  })

  it('la caché no salta las reglas de visibilidad', async () => {
    await page()
    project.visibilidad = 'privado'
    await cache.invalidatePublicData()

    expect((await page()).status).toBe(403)
  })

  it('recargar la página no suma visitas', async () => {
    await page()
    await page()
    await new Promise(resolve => setImmediate(resolve))

    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(1)
  })

  it('detrás de Cloudflare cuenta a cada visitante, no al servidor de Cloudflare', async () => {
    // trust proxy 1: X-Forwarded-For simula que la conexión llega desde Cloudflare
    const via = (visitor) => ({ 'X-Forwarded-For': '172.70.1.1', 'CF-Connecting-IP': visitor })
    await page(via('181.49.10.10'))
    await page(via('181.49.10.11'))
    await page(via('181.49.10.10'))
    await new Promise(resolve => setImmediate(resolve))

    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(2)
  })

  it('fuera de Cloudflare, CF-Connecting-IP no sirve para inflar visitas', async () => {
    await page({ 'CF-Connecting-IP': '1.1.1.1' })
    await page({ 'CF-Connecting-IP': '2.2.2.2' })
    await new Promise(resolve => setImmediate(resolve))

    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(1)
  })

  it('404 si el slug no existe', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue(null)
    mockPrisma.slugAnterior.findUnique.mockResolvedValue(null)

    expect((await page()).status).toBe(404)
  })
})
