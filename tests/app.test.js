const request = require('supertest')

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({})) }))
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  auth: () => ({ verifyIdToken: jest.fn() }),
}))

const app = require('../src/app')

describe('aplicación Express', () => {
  it('expone el health check', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('devuelve 404 con el formato estándar en una ruta desconocida', async () => {
    const res = await request(app).get('/api/v1/no-existe')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, message: 'Route not found' })
  })

  it('exige cabecera de autorización en los endpoints protegidos', async () => {
    const res = await request(app).get('/api/v1/users/me')

    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('permite el catálogo público sin autenticación', async () => {
    const res = await request(app).options('/api/v1/search')

    expect(res.status).toBeLessThan(400)
  })
})
