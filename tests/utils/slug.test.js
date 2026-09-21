const { generateSlug } = require('../../src/utils/slug')

describe('generateSlug', () => {
  it('pasa a minúsculas y une las palabras con guiones', () => {
    expect(generateSlug('Memoria Visual')).toMatch(/^memoria-visual-[a-z0-9]{6}$/)
  })

  it('quita los acentos y la eñe de los nombres en español', () => {
    expect(generateSlug('Simulación Minería')).toMatch(/^simulacion-mineria-/)
  })

  it('descarta los símbolos que no valen en una URL', () => {
    expect(generateSlug('¿Qué hacer? ¡Riesgos! (v2)')).toMatch(/^que-hacer-riesgos-v2-/)
  })

  it('recorta la parte legible a 40 caracteres', () => {
    const slug = generateSlug('a'.repeat(80))
    const [base] = slug.split(/-(?=[a-z0-9]{6}$)/)
    expect(base).toHaveLength(40)
  })

  it('añade un sufijo distinto a cada llamada, para que el slug sea único', () => {
    expect(generateSlug('Mismo nombre')).not.toBe(generateSlug('Mismo nombre'))
  })
})
