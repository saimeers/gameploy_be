const { signedUrl, tokenExpiry, parsePath, verify } = require('../../src/utils/cdnToken')

const SECRET = 'secreto'
const HOUR = 60 * 60 * 1000

describe('cdnToken', () => {
  afterEach(() => { delete process.env.CDN_TOKEN_TTL_MIN })

  it('da la misma URL a todos los que entran en la misma franja', () => {
    const base = Date.UTC(2026, 9, 3, 10, 0, 0)
    const a = signedUrl({ baseUrl: 'https://cdn', secret: SECRET, prefix: 'builds/x/', file: 'index.html', nowMs: base + 60_000 })
    const b = signedUrl({ baseUrl: 'https://cdn', secret: SECRET, prefix: 'builds/x/', file: 'index.html', nowMs: base + 50 * 60_000 })

    expect(a).toBe(b)
  })

  it('vence entre una y dos franjas después de emitirse', () => {
    const now = Date.UTC(2026, 9, 3, 10, 30, 0)
    const exp = tokenExpiry(now) * 1000

    expect(exp - now).toBeGreaterThanOrEqual(HOUR)
    expect(exp - now).toBeLessThanOrEqual(2 * HOUR)
  })

  it('la franja se configura con CDN_TOKEN_TTL_MIN', () => {
    process.env.CDN_TOKEN_TTL_MIN = '10'
    const now = Date.UTC(2026, 9, 3, 10, 0, 0)

    expect(tokenExpiry(now) * 1000 - now).toBe(20 * 60_000)
  })

  it('verifica sus propios enlaces y rechaza los alterados o vencidos', () => {
    const url = new URL(signedUrl({ baseUrl: 'https://cdn', secret: SECRET, prefix: 'media/i1/', file: 'portada.png' }))
    const target = parsePath(url.pathname)

    expect(target).toMatchObject({ prefix: 'media/i1/', key: 'media/i1/portada.png' })
    expect(verify(SECRET, target)).toBe(true)
    expect(verify('otro', target)).toBe(false)
    expect(verify(SECRET, { ...target, prefix: 'media/i2/' })).toBe(false)
    expect(verify(SECRET, target, target.exp * 1000 + 1)).toBe(false)
  })

  it('codifica los nombres de archivo en la URL', () => {
    const url = signedUrl({ baseUrl: 'https://cdn', secret: SECRET, prefix: 'media/i1/', file: 'mi portada.png' })

    expect(url).toMatch(/\/media\/i1\/mi%20portada\.png$/)
    expect(parsePath(new URL(url).pathname).key).toBe('media/i1/mi portada.png')
  })

  it('rechaza rutas fuera de builds/ y media/ o con ..', () => {
    expect(parsePath('/t/1.aaaaaaaaaaaaaaaaaaaaaaaa/otros/x/y')).toBeNull()
    expect(parsePath('/t/1.aaaaaaaaaaaaaaaaaaaaaaaa/builds/x/../y')).toBeNull()
    expect(parsePath('/builds/x/index.html')).toBeNull()
  })
})
