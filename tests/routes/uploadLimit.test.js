const request = require('supertest')

const mockPrisma = { usuario: { findUnique: jest.fn() } }

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => ({ verifyIdToken: jest.fn(async () => ({ uid: 'student-uid' })) }),
}))
jest.mock('../../src/services/version.service', () => ({
  uploadVersionFile: jest.fn(async (_v, _u, file, tipo) => ({ id: 'a1', tipo, nombre_archivo: file.originalname })),
}))

// El límite se lee al cargar la app: 10 KB en esta prueba (95 MB en producción).
process.env.UPLOAD_MAX_MB = String(10 / 1024)
const app = require('../../src/app')
delete process.env.UPLOAD_MAX_MB
const versionService = require('../../src/services/version.service')

const KB = 1024
const send = (bytes) => request(app)
  .post('/api/v1/projects/p1/versions/v1/files')
  .set('Authorization', 'Bearer token')
  .field('fileType', 'juego_webgl')
  .attach('file', Buffer.alloc(bytes), { filename: 'Juego.zip', contentType: 'application/zip' })

beforeEach(() => {
  mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1', activo: true, rol: { nombre: 'estudiante' } })
})

describe('límite de tamaño de las subidas', () => {
  it('acepta un archivo dentro del límite', async () => {
    const res = await send(5 * KB)

    expect(res.status).toBe(201)
    expect(versionService.uploadVersionFile).toHaveBeenCalled()
  })

  it('rechaza con 413 (no 500) un archivo que supera el límite', async () => {
    const res = await send(20 * KB)

    expect(res.status).toBe(413)
    expect(res.body.message).toMatch(/maximum is/)
    expect(versionService.uploadVersionFile).not.toHaveBeenCalled()
  })

  it('rechaza por Content-Length sin leer el cuerpo cuando la petición es mucho mayor', async () => {
    const res = await request(app)
      .post('/api/v1/projects/p1/versions/v1/files')
      .set('Authorization', 'Bearer token')
      .set('Content-Type', 'multipart/form-data; boundary=x')
      .set('Content-Length', String(500 * 1024 * KB))
      .send('')
      .ok(() => true)
      .catch(err => err.response)

    expect(res?.status).toBe(413)
    expect(versionService.uploadVersionFile).not.toHaveBeenCalled()
  })
})
