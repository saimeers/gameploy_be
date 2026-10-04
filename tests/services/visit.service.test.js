const mockPrisma = {
  visita: { create: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  proyecto: { findUnique: jest.fn() },
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('geoip-lite', () => ({
  lookup: jest.fn(ip => ({
    '181.49.10.10': { country: 'CO', region: 'ANT', city: 'Medellín' },
    '8.8.8.8': { country: 'US', region: '', city: '' },
  })[ip] ?? null),
}))

const geoip = require('geoip-lite')
const cache = require('../../src/services/cache.service')
const { setRedisForTests } = require('../../src/config/redis')
const { createFakeRedis } = require('../helpers/fakeRedis')
const visits = require('../../src/services/visit.service')

const STUDENT = { dbUser: { id: 'u1', rol: { nombre: 'estudiante' } } }
const ADMIN = { dbUser: { id: 'a1', rol: { nombre: 'admin' } } }

afterEach(() => {
  jest.useRealTimers()
  setRedisForTests(null)
  cache._resetForTests()
})

beforeEach(() => {
  mockPrisma.visita.create.mockResolvedValue({})
  mockPrisma.visita.count.mockResolvedValue(3)
  mockPrisma.visita.groupBy.mockResolvedValue([])
})

describe('locate', () => {
  it('resuelve país, región y ciudad de una IP pública', () => {
    expect(visits.locate('181.49.10.10')).toEqual({ codigo_pais: 'CO', region: 'ANT', ciudad: 'Medellín' })
  })

  it('acepta direcciones IPv4 mapeadas en IPv6', () => {
    visits.locate('::ffff:181.49.10.10')

    expect(geoip.lookup).toHaveBeenLastCalledWith('181.49.10.10')
  })

  it('deja en null lo que la base no conoce', () => {
    expect(visits.locate('8.8.8.8')).toEqual({ codigo_pais: 'US', region: null, ciudad: null })
    expect(visits.locate('127.0.0.1')).toEqual({ codigo_pais: null, region: null, ciudad: null })
    expect(visits.locate(undefined)).toEqual({ codigo_pais: null, region: null, ciudad: null })
  })
})

describe('locate detrás de Cloudflare', () => {
  // La base offline ubica los rangos colombianos en Estados Unidos o Brasil,
  // porque sigue a quien los registró. Cloudflare resuelve en el borde.
  const CUCUTA = {
    'cf-ipcountry': 'CO',
    'cf-region-code': 'NSA',
    'cf-ipcity': 'Cúcuta',
  }

  it('prefiere la ubicación que resuelve Cloudflare', () => {
    expect(visits.locate('8.8.8.8', CUCUTA))
      .toEqual({ codigo_pais: 'CO', region: 'NSA', ciudad: 'Cúcuta' })
    expect(geoip.lookup).not.toHaveBeenCalled()
  })

  it('con solo el país, que es lo que llega sin activar las cabeceras de ubicación', () => {
    expect(visits.locate('8.8.8.8', { 'cf-ipcountry': 'co' }))
      .toEqual({ codigo_pais: 'CO', region: null, ciudad: null })
  })

  it('usa el nombre de la región si no viene su código', () => {
    expect(visits.locate(undefined, { 'cf-ipcountry': 'CO', 'cf-region': 'Norte de Santander' }).region)
      .toBe('Norte de Santander')
  })

  it('descifra la ciudad cuando viene codificada', () => {
    expect(visits.locate(undefined, { 'cf-ipcountry': 'CO', 'cf-ipcity': 'C%C3%BAcuta' }).ciudad)
      .toBe('Cúcuta')
  })

  it('recurre a la base offline cuando Cloudflare no sabe de dónde viene', () => {
    expect(visits.locate('181.49.10.10', { 'cf-ipcountry': 'XX' }))
      .toEqual({ codigo_pais: 'CO', region: 'ANT', ciudad: 'Medellín' })
    expect(visits.locate('181.49.10.10', { 'cf-ipcountry': 'T1' }).codigo_pais).toBe('CO')
  })

  it('recurre a la base offline sin pasar por Cloudflare, como en desarrollo', () => {
    expect(visits.locate('181.49.10.10', {}).ciudad).toBe('Medellín')
    expect(visits.locate('181.49.10.10').ciudad).toBe('Medellín')
  })
})

describe('recordVisit', () => {
  it('guarda la ubicación de la visita, nunca la IP', async () => {
    await visits.recordVisit('p1', { ip: '181.49.10.10', origen: 'https://x.test' })

    const { data } = mockPrisma.visita.create.mock.calls[0][0]
    expect(data).toEqual({
      id_proyecto: 'p1', origen: 'https://x.test', codigo_pais: 'CO', region: 'ANT', ciudad: 'Medellín',
    })
    expect(JSON.stringify(data)).not.toContain('181.49')
  })

  it('guarda la ubicación que resolvió Cloudflare cuando la petición pasó por él', async () => {
    await visits.recordVisit('p1', {
      ip: '8.8.8.8',
      headers: { 'cf-ipcountry': 'CO', 'cf-region-code': 'NSA', 'cf-ipcity': 'Cúcuta' },
    })

    expect(mockPrisma.visita.create.mock.calls[0][0].data).toMatchObject({
      codigo_pais: 'CO', region: 'NSA', ciudad: 'Cúcuta',
    })
  })

  it('cuenta una sola visita por visitante cada 30 minutos', async () => {
    jest.useFakeTimers({ now: Date.now() })

    await visits.recordVisit('p1', { ip: '181.49.10.10' })
    await visits.recordVisit('p1', { ip: '181.49.10.10' })
    await visits.recordVisit('p2', { ip: '181.49.10.10' })
    await visits.recordVisit('p1', { ip: '8.8.8.8' })
    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(3)

    jest.advanceTimersByTime(31 * 60 * 1000)
    await visits.recordVisit('p1', { ip: '181.49.10.10' })
    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(4)
  })

  it('en Redis guarda un hash del visitante que vence en 30 minutos, no la IP', async () => {
    const redis = createFakeRedis()
    setRedisForTests(redis)

    await visits.recordVisit('p1', { ip: '181.49.10.10' })
    await visits.recordVisit('p1', { ip: '181.49.10.10' })

    const [key] = [...redis.data.keys()]
    expect(key).toMatch(/^visit:p1:[A-Za-z0-9_-]{22}$/)
    expect(key).not.toContain('181')
    expect(await redis.pttl(key)).toBeGreaterThan(29 * 60 * 1000)
    expect(await redis.pttl(key)).toBeLessThanOrEqual(30 * 60 * 1000)
    expect(mockPrisma.visita.create).toHaveBeenCalledTimes(1)
  })

  it('no lanza si la base de datos falla', async () => {
    mockPrisma.visita.create.mockRejectedValue(new Error('db caída'))

    await expect(visits.recordVisit('p1', {})).resolves.toBeUndefined()
  })
})

describe('parseDays', () => {
  it('acepta de 1 a 365 días y si no, usa todo el histórico', () => {
    expect(visits.parseDays('30')).toBe(30)
    expect(visits.parseDays(undefined)).toBeUndefined()
    expect(visits.parseDays('0')).toBeUndefined()
    expect(visits.parseDays('999')).toBeUndefined()
    expect(visits.parseDays('abc')).toBeUndefined()
  })
})

describe('getVisitStats', () => {
  it('agrupa por país y por ciudad', async () => {
    mockPrisma.visita.groupBy
      .mockResolvedValueOnce([
        { codigo_pais: 'CO', _count: { id: 2 } },
        { codigo_pais: null, _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([
        { codigo_pais: 'CO', region: 'NSA', ciudad: 'Cúcuta', _count: { id: 2 } },
      ])

    const stats = await visits.getVisitStats({})

    expect(stats).toEqual({
      total: 3,
      days: null,
      countries: [{ codigo_pais: 'CO', visitas: 2 }, { codigo_pais: null, visitas: 1 }],
      cities: [{ codigo_pais: 'CO', region: 'NSA', ciudad: 'Cúcuta', visitas: 2 }],
    })
  })

  it('guarda las estadísticas en caché unos minutos', async () => {
    await visits.getVisitStats({ projectId: 'p9' })
    await visits.getVisitStats({ projectId: 'p9' })

    expect(mockPrisma.visita.count).toHaveBeenCalledTimes(1)
  })

  it('filtra por dueño y por periodo', async () => {
    await visits.getVisitStats({ ownerId: 'u1', days: 7 })

    const { where } = mockPrisma.visita.count.mock.calls[0][0]
    expect(where.proyecto).toEqual({ id_usuario: 'u1' })
    expect(where.fecha.gte.getTime()).toBeGreaterThan(Date.now() - 8 * 24 * 60 * 60 * 1000)
  })
})

describe('getProjectVisitStats', () => {
  it('se las muestra al dueño del proyecto y al admin', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue({ id_usuario: 'u1' })

    await expect(visits.getProjectVisitStats('p1', STUDENT)).resolves.toHaveProperty('total', 3)
    await expect(visits.getProjectVisitStats('p1', ADMIN)).resolves.toHaveProperty('total', 3)
  })

  it('las niega a otro estudiante', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue({ id_usuario: 'otro' })

    await expect(visits.getProjectVisitStats('p1', STUDENT)).rejects.toThrow('Not authorized')
  })

  it('responde 404 si el proyecto no existe', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue(null)

    await expect(visits.getProjectVisitStats('p1', STUDENT)).rejects.toThrow('Project not found')
  })
})
