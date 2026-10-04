const request = require('supertest')

const mockPrisma = {
  usuario: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  proyecto: { count: jest.fn() },
  comentario: { count: jest.fn() },
  respuestaEncuesta: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(fn => fn(mockPrisma)),
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => ({ verifyIdToken: jest.fn(async (token) => ({ uid: token })) }),
}))

const app = require('../../src/app')

const ANSWER = { version: 1, momento: 'tras_jugar', sus: Array(10).fill(4), ux: Array(10).fill(4) }
const account = (rol) => ({
  id: `id-${rol}`, activo: true, rol: { nombre: rol }, fecha_registro: new Date(), dias_activos: 1,
  ultimo_dia_activo: new Date(new Date().toISOString().slice(0, 10)), encuesta_respondida: false, encuesta_pospuestas: 0,
})

beforeEach(() => {
  mockPrisma.usuario.findUnique.mockImplementation(async ({ where }) => account(where.firebase_uid))
  mockPrisma.usuario.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.proyecto.count.mockResolvedValue(0)
  mockPrisma.comentario.count.mockResolvedValue(0)
  mockPrisma.respuestaEncuesta.findMany.mockResolvedValue([])
})

describe('encuesta', () => {
  it('un visitante sin cuenta puede responder', async () => {
    const res = await request(app).post('/api/v1/encuesta').send(ANSWER)

    expect(res.status).toBe(201)
    expect(mockPrisma.respuestaEncuesta.create.mock.calls[0][0].data.perfil).toBe('visitante')
  })

  it('con sesión se guarda el perfil de la cuenta', async () => {
    await request(app).post('/api/v1/encuesta').set('Authorization', 'Bearer docente').send(ANSWER).expect(201)

    expect(mockPrisma.respuestaEncuesta.create.mock.calls[0][0].data.perfil).toBe('docente')
  })

  it('valida la respuesta (422)', async () => {
    const res = await request(app).post('/api/v1/encuesta').send({ ...ANSWER, sus: [1, 2] })

    expect(res.status).toBe(422)
  })

  it('el estado sin sesión es neutral, y con sesión dice si invitar', async () => {
    const anon = await request(app).get('/api/v1/encuesta/estado')
    expect(anon.body.data).toMatchObject({ puede_responder: true, invitar: false })

    mockPrisma.proyecto.count.mockResolvedValue(1)
    const student = await request(app).get('/api/v1/encuesta/estado').set('Authorization', 'Bearer estudiante')
    expect(student.body.data).toMatchObject({ invitar: true, momento: 'primer_proyecto' })
  })

  it('posponer exige sesión', async () => {
    await request(app).post('/api/v1/encuesta/posponer').expect(401)
    await request(app).post('/api/v1/encuesta/posponer').set('Authorization', 'Bearer estudiante').expect(200)
  })

  it('los resultados y el CSV son solo para el admin', async () => {
    await request(app).get('/api/v1/admin/encuestas/resumen').set('Authorization', 'Bearer estudiante').expect(403)

    const summary = await request(app).get('/api/v1/admin/encuestas/resumen?dias=30').set('Authorization', 'Bearer admin')
    expect(summary.status).toBe(200)
    expect(summary.body.data).toMatchObject({ total: 0, version: 1 })

    const csv = await request(app).get('/api/v1/admin/encuestas/export.csv').set('Authorization', 'Bearer admin')
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toMatch(/text\/csv/)
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="encuesta-gameploy-\d{4}-\d{2}-\d{2}\.csv"/)
  })
})
