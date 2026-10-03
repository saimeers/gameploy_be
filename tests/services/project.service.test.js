const mockPrisma = {
  proyecto: { findUnique: jest.fn(), update: jest.fn() },
  slugAnterior: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))

const projects = require('../../src/services/project.service')

const OWNER = { dbUser: { id: 'u1', rol: { nombre: 'estudiante' } } }
const OTHER = { dbUser: { id: 'u2', rol: { nombre: 'estudiante' } } }
const PROJECT = { id: 'p1', slug: 'memoria-x7k2ab', id_usuario: 'u1' }

/** findUnique de proyecto: por id devuelve PROJECT; por slug, lo que diga `bySlug`. */
const projectLookup = (bySlug = {}) => ({ where }) =>
  Promise.resolve(where.id ? PROJECT : bySlug[where.slug] ?? null)

beforeEach(() => {
  mockPrisma.proyecto.findUnique.mockImplementation(projectLookup())
  mockPrisma.slugAnterior.findUnique.mockResolvedValue(null)
  mockPrisma.proyecto.update.mockImplementation(({ data }) => Promise.resolve({ ...PROJECT, ...data }))
})

describe('checkSlug', () => {
  it('normaliza la entrada y la da por libre si nadie la usa', async () => {
    await expect(projects.checkSlug('p1', 'Mi Juego', OWNER)).resolves.toEqual({
      slug: 'mi-juego', valid: true, available: true, reason: null,
    })
  })

  it('rechaza formas inválidas', async () => {
    const res = await projects.checkSlug('p1', 'ab', OWNER)

    expect(res).toMatchObject({ valid: false, available: false })
  })

  it('no deja usar el slug actual ni uno anterior de otro proyecto', async () => {
    mockPrisma.proyecto.findUnique.mockImplementation(projectLookup({ ocupado: { id: 'p2' } }))
    await expect(projects.checkSlug('p1', 'ocupado', OWNER)).resolves.toMatchObject({ available: false })

    mockPrisma.slugAnterior.findUnique.mockResolvedValue({ id_proyecto: 'p2' })
    await expect(projects.checkSlug('p1', 'viejo-de-otro', OWNER)).resolves.toMatchObject({ available: false })
  })

  it('deja recuperar un slug anterior del mismo proyecto', async () => {
    mockPrisma.slugAnterior.findUnique.mockResolvedValue({ id_proyecto: 'p1' })

    await expect(projects.checkSlug('p1', 'mi-viejo-slug', OWNER)).resolves.toMatchObject({ available: true })
  })

  it('solo lo consulta el dueño del proyecto o un admin', async () => {
    await expect(projects.checkSlug('p1', 'algo', OTHER)).rejects.toThrow('You do not own this project')
  })
})

describe('changeSlug', () => {
  it('guarda el slug anterior para que los enlaces viejos sigan funcionando', async () => {
    const updated = await projects.changeSlug('p1', 'nuevo-nombre', OWNER)

    expect(mockPrisma.slugAnterior.create).toHaveBeenCalledWith({
      data: { slug: 'memoria-x7k2ab', id_proyecto: 'p1' },
    })
    expect(updated.slug).toBe('nuevo-nombre')
  })

  it('responde 409 si el slug está ocupado y 422 si no es válido', async () => {
    mockPrisma.proyecto.findUnique.mockImplementation(projectLookup({ ocupado: { id: 'p2' } }))
    await expect(projects.changeSlug('p1', 'ocupado', OWNER)).rejects.toMatchObject({ statusCode: 409 })
    await expect(projects.changeSlug('p1', '!!', OWNER)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('convierte en 409 la carrera con otro proyecto que tomó el slug a la vez', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

    await expect(projects.changeSlug('p1', 'disputado', OWNER)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('resolveSlug', () => {
  it('encuentra el proyecto por su slug actual o por uno anterior', async () => {
    mockPrisma.proyecto.findUnique.mockImplementation(projectLookup({ actual: { id: 'p1' } }))
    await expect(projects.resolveSlug('actual')).resolves.toBe('p1')

    mockPrisma.slugAnterior.findUnique.mockResolvedValue({ id_proyecto: 'p1' })
    await expect(projects.resolveSlug('viejo')).resolves.toBe('p1')
  })

  it('devuelve null si nadie lo usa', async () => {
    await expect(projects.resolveSlug('nada')).resolves.toBeNull()
  })
})

describe('updateProject', () => {
  it('ignora los campos que tienen su propio endpoint', async () => {
    await projects.updateProject('p1', 'u1', {
      nombre: 'Nuevo', slug: 'hack', estado: 'publicado', destacado: true, id_usuario: 'u2',
    })

    expect(mockPrisma.proyecto.update.mock.calls[0][0].data).toEqual({ nombre: 'Nuevo' })
  })
})
