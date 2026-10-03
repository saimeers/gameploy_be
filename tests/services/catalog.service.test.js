const mockPrisma = {
  categoria: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  etiqueta: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))

const catalog = require('../../src/services/catalog.service')
const cache = require('../../src/services/cache.service')

describe('catálogo de categorías y etiquetas', () => {
  it('ofrece solo las activas en los formularios', async () => {
    await catalog.listActive('categoria')

    expect(mockPrisma.categoria.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { activo: true } }))
  })

  it('lista todas para el admin, con cuántos proyectos las usan', async () => {
    await catalog.list('etiqueta')

    expect(mockPrisma.etiqueta.findMany.mock.calls[0][0].include).toEqual({ _count: { select: { proyectos: true } } })
  })

  it('desactiva sin borrar', async () => {
    mockPrisma.categoria.update.mockResolvedValue({ id: 1, activo: false })

    await catalog.setStatus('categoria', '1', false)

    expect(mockPrisma.categoria.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 }, data: { activo: false },
    }))
    expect(mockPrisma.categoria.delete).not.toHaveBeenCalled()
  })

  it('al desactivar, los filtros y la búsqueda dejan de mostrarla', async () => {
    mockPrisma.categoria.update.mockResolvedValue({ id: 1, activo: false })
    const load = jest.fn().mockResolvedValue([])
    await cache.remember('catalog', 'categorias', 300, load)
    await cache.remember('search', 'q', 60, load)

    await catalog.setStatus('categoria', '1', false)
    await cache.remember('catalog', 'categorias', 300, load)
    await cache.remember('search', 'q', 60, load)

    expect(load).toHaveBeenCalledTimes(4)
  })

  it('exige un booleano para cambiar el estado', () => {
    expect(() => catalog.setStatus('categoria', '1', 'no')).toThrow('activo must be a boolean')
  })

  it('se niega a borrar una categoría que usan proyectos', async () => {
    mockPrisma.categoria.findUnique.mockResolvedValue({ id: 1, _count: { proyectos: 3 } })

    await expect(catalog.remove('categoria', '1')).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.categoria.delete).not.toHaveBeenCalled()
  })

  it('borra la que nadie usa', async () => {
    mockPrisma.etiqueta.findUnique.mockResolvedValue({ id: 2, _count: { proyectos: 0 } })

    await catalog.remove('etiqueta', '2')

    expect(mockPrisma.etiqueta.delete).toHaveBeenCalledWith({ where: { id: 2 } })
  })

  it('solo guarda los campos de cada tipo y traduce los nombres repetidos a 409', async () => {
    mockPrisma.etiqueta.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))

    await expect(catalog.create('etiqueta', { nombre: 'Memoria', id: 99, activo: false }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.etiqueta.create.mock.calls[0][0].data).toEqual({ nombre: 'Memoria' })
  })

  it('exige un nombre al crear', () => {
    expect(() => catalog.create('categoria', { nombre: '  ' })).toThrow('nombre is required')
  })
})
