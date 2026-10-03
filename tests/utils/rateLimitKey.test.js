const request = require('supertest')

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({})) }))
jest.mock('firebase-admin', () => ({
  apps: [{}], initializeApp: jest.fn(), credential: { cert: jest.fn() }, auth: () => ({ verifyIdToken: jest.fn() }),
}))

// El límite se lee al cargar la app; se restaura para no afectar a otras pruebas.
process.env.RATE_LIMIT_MAX = '2'
const app = require('../../src/app')
delete process.env.RATE_LIMIT_MAX

describe('límite de peticiones por visitante', () => {
  it('detrás de Cloudflare, cada visitante tiene su propio límite', async () => {
    const via = (visitor) => ({ 'X-Forwarded-For': '172.70.1.1', 'CF-Connecting-IP': visitor })

    await request(app).get('/health').set(via('181.49.10.10')).expect(200)
    await request(app).get('/health').set(via('181.49.10.10')).expect(200)
    await request(app).get('/health').set(via('181.49.10.10')).expect(429)
    // Otro visitante que entra por el mismo servidor de Cloudflare no queda bloqueado
    await request(app).get('/health').set(via('181.49.10.99')).expect(200)
  })
})
