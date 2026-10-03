const { generateSlug, slugify, isValidSlug } = require('../../src/utils/slug')

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

describe('slugify', () => {
  it('normaliza lo que escribe el estudiante', () => {
    expect(slugify('  Mi Juego -- Ñandú  ')).toBe('mi-juego-nandu')
    expect(slugify('¡Hola!')).toBe('hola')
    expect(slugify(undefined)).toBe('')
  })
})

describe('isValidSlug', () => {
  it('acepta letras, números y guiones simples entre 3 y 60 caracteres', () => {
    expect(isValidSlug('memoria-2025')).toBe(true)
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('a'.repeat(61))).toBe(false)
    expect(isValidSlug('mi--juego')).toBe(false)
    expect(isValidSlug('-juego')).toBe(false)
    expect(isValidSlug('Juego')).toBe(false)
  })
})

describe('generateSlug con nombres sin letras', () => {
  it('usa una base genérica en vez de empezar por guion', () => {
    expect(generateSlug('¿?')).toMatch(/^juego-[a-z0-9]{6}$/)
  })
})
