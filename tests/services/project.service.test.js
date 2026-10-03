const mockPrisma = {
  proyecto: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  slugAnterior: { findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  archivo: { findMany: jest.fn(), count: jest.fn() },
  categoria: { findUnique: jest.fn() },
  etiqueta: { count: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('../../src/services/storage.service', () => ({
  deleteFile: jest.fn(() => Promise.resolve()),
  getObjectBuffer: jest.fn(),
}))

const { deleteFile } = require('../../src/services/storage.service')

const projects = require('../../src/services/project.service')
const cache = require('../../src/services/cache.service')

const OWNER = { dbUser: { id: 'u1', rol: { nombre: 'estudiante' } } }
const OTHER = { dbUser: { id: 'u2', rol: { nombre: 'estudiante' } } }
const PROJECT = {
  id: 'p1', slug: 'memoria-x7k2ab', id_usuario: 'u1', id_categoria: 3, etiquetas: [{ id_etiqueta: 7 }],
}

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

  it('invalida la ficha pública en caché (p. ej. al pasar a privado)', async () => {
    const load = jest.fn().mockResolvedValue({ visibilidad: 'publico' })
    await cache.remember('games', 'slug:memoria-x7k2ab', 60, load)

    await projects.updateProject('p1', 'u1', { visibilidad: 'privado' })
    await cache.remember('games', 'slug:memoria-x7k2ab', 60, load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('updateProject con el catálogo', () => {
  it('no deja asignar una categoría inactiva', async () => {
    mockPrisma.categoria.findUnique.mockResolvedValue({ id: 4, activo: false })

    await expect(projects.updateProject('p1', 'u1', { id_categoria: 4 })).rejects.toMatchObject({ statusCode: 422 })
  })

  it('deja conservar la categoría y las etiquetas que ya tenía aunque estén inactivas', async () => {
    mockPrisma.etiqueta.count.mockResolvedValue(0)

    await projects.updateProject('p1', 'u1', { id_categoria: 3, etiquetas: [7] })

    expect(mockPrisma.categoria.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.etiqueta.count).not.toHaveBeenCalled()
  })

  it('no deja añadir etiquetas inactivas', async () => {
    mockPrisma.etiqueta.count.mockResolvedValue(1)

    await expect(projects.updateProject('p1', 'u1', { etiquetas: [7, 8, 9] })).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('deleteProjectAndFiles', () => {
  it('borra del bucket los archivos que ya nadie usa, una vez cada uno', async () => {
    mockPrisma.archivo.findMany.mockResolvedValue([
      { ruta_storage: 'k/game.zip' }, { ruta_storage: 'k/game.zip' }, { ruta_storage: 'k/heredada.png' },
    ])
    // La imagen sigue referenciada por otra fila, p. ej. una versión que la heredó.
    mockPrisma.archivo.count.mockImplementation(({ where }) =>
      Promise.resolve(where.ruta_storage === 'k/heredada.png' ? 1 : 0))

    await projects.deleteProjectAndFiles('p1')

    expect(mockPrisma.proyecto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(deleteFile.mock.calls).toEqual([['k/game.zip']])
  })
})

describe('getProjectBySlug y los borradores', () => {
  const full = (overrides) => ({ ...PROJECT, estado: 'publicado', visibilidad: 'publico', ...overrides })

  beforeEach(() => {
    mockPrisma.proyecto.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.slug ? { id: 'p1' } : global.__project))
  })

  it('un borrador solo lo ve su dueño o un admin', async () => {
    global.__project = full({ estado: 'borrador' })
    const ADMIN = { dbUser: { id: 'a1', rol: { nombre: 'admin' } } }

    await expect(projects.getProjectBySlug('memoria', null)).rejects.toMatchObject({ statusCode: 403 })
    await expect(projects.getProjectBySlug('memoria', OTHER)).rejects.toMatchObject({ statusCode: 403 })
    await expect(projects.getProjectBySlug('memoria', OWNER)).resolves.toMatchObject({ id: 'p1' })
    await expect(projects.getProjectBySlug('memoria', ADMIN)).resolves.toMatchObject({ id: 'p1' })
  })

  it('un proyecto privado tampoco lo ve otro estudiante', async () => {
    global.__project = full({ visibilidad: 'privado' })

    await expect(projects.getProjectBySlug('memoria', OTHER)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('uno publicado y público lo ve cualquiera', async () => {
    global.__project = full()

    await expect(projects.getProjectBySlug('memoria', null)).resolves.toMatchObject({ id: 'p1' })
  })
})
