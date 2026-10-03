const { clientIp, isCloudflare } = require('../../src/utils/clientIp')

const req = (ip, headers = {}) => ({ ip, headers })

describe('isCloudflare', () => {
  it('reconoce los rangos IPv4 e IPv6 de Cloudflare', () => {
    expect(isCloudflare('172.70.1.1')).toBe(true)
    expect(isCloudflare('::ffff:162.158.10.20')).toBe(true)
    expect(isCloudflare('2606:4700:3031::6815:4ffe')).toBe(true)
  })

  it('no confunde otras direcciones', () => {
    expect(isCloudflare('181.49.10.10')).toBe(false)
    expect(isCloudflare('127.0.0.1')).toBe(false)
    expect(isCloudflare('2001:db8::1')).toBe(false)
    expect(isCloudflare(undefined)).toBe(false)
    expect(isCloudflare('no-es-ip')).toBe(false)
  })
})

describe('clientIp', () => {
  it('detrás del proxy de Cloudflare usa la IP del visitante (CF-Connecting-IP)', () => {
    expect(clientIp(req('172.70.1.1', { 'cf-connecting-ip': '181.49.10.10' }))).toBe('181.49.10.10')
    expect(clientIp(req('2606:4700::1', { 'cf-connecting-ip': '2800:e2:1::5' }))).toBe('2800:e2:1::5')
  })

  it('ignora la cabecera si la petición no viene de Cloudflare: no se puede falsificar', () => {
    expect(clientIp(req('181.49.10.10', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('181.49.10.10')
  })

  it('ignora una cabecera que no es una IP', () => {
    expect(clientIp(req('172.70.1.1', { 'cf-connecting-ip': 'hola' }))).toBe('172.70.1.1')
  })

  it('sin Cloudflare devuelve req.ip, sin el prefijo IPv4 en IPv6', () => {
    expect(clientIp(req('::ffff:181.49.10.10'))).toBe('181.49.10.10')
    expect(clientIp(req('2800:e2:1::5'))).toBe('2800:e2:1::5')
  })
})
