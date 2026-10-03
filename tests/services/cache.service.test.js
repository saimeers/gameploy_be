const { setRedisForTests } = require('../../src/config/redis')
const cache = require('../../src/services/cache.service')
const { createFakeRedis } = require('../helpers/fakeRedis')

afterEach(() => {
  jest.useRealTimers()
  setRedisForTests(null)
  cache._resetForTests()
})

const behavesAsACache = () => {
  it('calcula una vez y luego responde desde la caché', async () => {
    const fn = jest.fn().mockResolvedValue({ nombre: 'Juego' })

    await cache.remember('games', 'slug:a', 60, fn)
    const second = await cache.remember('games', 'slug:a', 60, fn)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ nombre: 'Juego' })
  })

  it('entrega copias: cambiar lo devuelto no altera la caché', async () => {
    const first = await cache.remember('games', 'slug:a', 60, async () => ({ archivos: [{ ruta_storage: 'k' }] }))
    delete first.archivos[0].ruta_storage

    const second = await cache.remember('games', 'slug:a', 60, jest.fn())

    expect(second.archivos[0].ruta_storage).toBe('k')
  })

  it('vence pasado el TTL', async () => {
    jest.useFakeTimers({ now: Date.now() })
    const fn = jest.fn().mockResolvedValue(1)

    await cache.remember('search', 'q', 60, fn)
    jest.advanceTimersByTime(61 * 1000)
    await cache.remember('search', 'q', 60, fn)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('bump invalida todo el espacio de nombres y solo ese', async () => {
    const games = jest.fn().mockResolvedValue('g')
    const catalog = jest.fn().mockResolvedValue('c')
    await cache.remember('games', 'slug:a', 60, games)
    await cache.remember('catalog', 'categorias', 60, catalog)

    await cache.invalidatePublicData()
    await cache.remember('games', 'slug:a', 60, games)
    await cache.remember('catalog', 'categorias', 60, catalog)

    expect(games).toHaveBeenCalledTimes(2)
    expect(catalog).toHaveBeenCalledTimes(1)
  })

  it('guarda los BigInt (tamaños de archivo) como texto', async () => {
    const value = await cache.remember('games', 'big', 60, async () => ({ tamanio_bytes: 10n }))

    expect(value).toEqual({ tamanio_bytes: '10' })
  })

  it('setIfAbsent solo es cierto la primera vez dentro del TTL', async () => {
    jest.useFakeTimers({ now: Date.now() })

    expect(await cache.setIfAbsent('visit:p1:x', 1800)).toBe(true)
    expect(await cache.setIfAbsent('visit:p1:x', 1800)).toBe(false)
    jest.advanceTimersByTime(1801 * 1000)
    expect(await cache.setIfAbsent('visit:p1:x', 1800)).toBe(true)
  })
}

describe('cache sin Redis (memoria)', behavesAsACache)

describe('cache con Redis', () => {
  let redis
  beforeEach(() => {
    redis = createFakeRedis()
    setRedisForTests(redis)
  })

  behavesAsACache()

  it('guarda en Redis con vencimiento', async () => {
    await cache.remember('games', 'slug:a', 60, async () => 'x')

    const [key, value, mode, ttl] = redis.set.mock.calls[0]
    expect(key).toBe('cache:games:v0:slug:a')
    expect([value, mode, ttl]).toEqual(['"x"', 'EX', 60])
  })

  it('si Redis se cae, sigue respondiendo sin caché', async () => {
    redis.failing = true
    const fn = jest.fn().mockResolvedValue('x')

    await expect(cache.remember('games', 'slug:a', 60, fn)).resolves.toBe('x')
    await expect(cache.remember('games', 'slug:a', 60, fn)).resolves.toBe('x')
    await expect(cache.bump('games')).resolves.toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('si Redis se cae, setIfAbsent cuenta la visita', async () => {
    redis.failing = true

    expect(await cache.setIfAbsent('visit:p1:x', 1800)).toBe(true)
  })
})
