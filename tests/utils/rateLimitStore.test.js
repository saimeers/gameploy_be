const express = require('express')
const request = require('supertest')
const rateLimit = require('express-rate-limit')
const { RedisRateLimitStore } = require('../../src/utils/rateLimitStore')
const { createFakeRedis } = require('../helpers/fakeRedis')

const appWith = (redis, max = 2) => {
  const app = express()
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max,
    passOnStoreError: true,
    store: new RedisRateLimitStore(redis, 'rl:test:'),
  }))
  app.get('/', (_req, res) => res.send('ok'))
  return app
}

afterEach(() => jest.useRealTimers())

describe('RedisRateLimitStore', () => {
  it('cuenta en Redis y bloquea al pasar el límite', async () => {
    const redis = createFakeRedis()
    const app = appWith(redis)

    await request(app).get('/').expect(200)
    await request(app).get('/').expect(200)
    await request(app).get('/').expect(429)

    const [key] = [...redis.data.keys()]
    expect(key).toMatch(/^rl:test:/)
  })

  it('reinicia la cuenta al terminar la ventana', async () => {
    const redis = createFakeRedis()
    const store = new RedisRateLimitStore(redis, 'rl:test:')
    store.init({ windowMs: 1000 })
    jest.useFakeTimers({ now: Date.now() })

    await store.increment('ip')
    const second = await store.increment('ip')
    jest.advanceTimersByTime(1001)
    const afterWindow = await store.increment('ip')

    expect(second.totalHits).toBe(2)
    expect(second.resetTime.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
    expect(afterWindow.totalHits).toBe(1)
  })

  it('las peticiones siguientes no alargan la ventana', async () => {
    const redis = createFakeRedis()
    const store = new RedisRateLimitStore(redis, 'rl:test:')
    store.init({ windowMs: 1000 })
    jest.useFakeTimers({ now: Date.now() })

    const first = await store.increment('ip')
    jest.advanceTimersByTime(500)
    const second = await store.increment('ip')

    expect(second.resetTime.getTime()).toBe(first.resetTime.getTime())
  })

  it('si Redis se cae, deja pasar las peticiones', async () => {
    const redis = createFakeRedis()
    redis.failing = true
    const app = appWith(redis, 1)

    await request(app).get('/').expect(200)
    await request(app).get('/').expect(200)
  })
})
