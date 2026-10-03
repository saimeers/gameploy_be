const request = require('supertest')

const mockPrisma = {
  usuario: { findUnique: jest.fn() },
}

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

const app = require('../../src/app')
const versionService = require('../../src/services/version.service')

beforeEach(() => {
  mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'u1', activo: true, rol: { nombre: 'estudiante' } })
})

describe('POST /projects/:id/versions/:versionId/files', () => {
  it('conserva tildes y eñes en el nombre del archivo', async () => {
    const res = await request(app)
      .post('/api/v1/projects/p1/versions/v1/files')
      .set('Authorization', 'Bearer token')
      .field('fileType', 'portada')
      .attach('file', Buffer.from('png'), { filename: 'Portada Ñandú.png', contentType: 'image/png' })

    expect(res.status).toBe(201)
    expect(versionService.uploadVersionFile.mock.calls[0][2].originalname).toBe('Portada Ñandú.png')
    expect(res.body.data.nombre_archivo).toBe('Portada Ñandú.png')
  })
})
