const mockPrisma = {
  proyecto:        { findUnique: jest.fn() },
  versionProyecto: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  archivo:         { delete: jest.fn(), count: jest.fn() },
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('../../src/services/storage.service', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  buildStorageKey: jest.fn(() => 'key'),
}))

const { createVersion } = require('../../src/services/version.service')

const OWNER = 'user-1'
const PROJECT = { id: 'proj-1', id_usuario: OWNER }

const ARCHIVOS = [
  { id: 'a1', tipo: 'juego_webgl', nombre_archivo: 'game.zip',  ruta_storage: 'k/game.zip',  tamanio_bytes: 100n },
  { id: 'a2', tipo: 'portada',     nombre_archivo: 'cover.png', ruta_storage: 'k/cover.png', tamanio_bytes: 20n },
  { id: 'a3', tipo: 'captura',     nombre_archivo: 'shot.png',  ruta_storage: 'k/shot.png',  tamanio_bytes: 30n },
]

/** Archivos que la llamada a prisma.versionProyecto.create pidió crear. */
const createdFiles = () => mockPrisma.versionProyecto.create.mock.calls[0][0].data.archivos.create

beforeEach(() => {
  mockPrisma.proyecto.findUnique.mockResolvedValue(PROJECT)
  mockPrisma.versionProyecto.findFirst.mockResolvedValue({ id: 'v1', archivos: ARCHIVOS })
  mockPrisma.versionProyecto.create.mockResolvedValue({ id: 'v2' })
})

describe('createVersion', () => {
  it('rechaza a quien no es el dueño del proyecto', async () => {
    await expect(
      createVersion('proj-1', 'otro-usuario', { numero_version: '1.1' })
    ).rejects.toThrow('You do not own this project')

    expect(mockPrisma.versionProyecto.create).not.toHaveBeenCalled()
  })

  it('falla si el proyecto no existe', async () => {
    mockPrisma.proyecto.findUnique.mockResolvedValue(null)

    await expect(
      createVersion('proj-x', OWNER, { numero_version: '1.1' })
    ).rejects.toThrow('Project not found')
  })

  it('hereda todos los archivos de la versión activa cuando no se indica nada', async () => {
    await createVersion('proj-1', OWNER, { numero_version: '1.1' })

    expect(createdFiles()).toHaveLength(3)
    expect(createdFiles()[0]).toMatchObject({
      tipo: 'juego_webgl',
      ruta_storage: 'k/game.zip',
    })
  })

  it('hereda solo los archivos indicados en heredar', async () => {
    await createVersion('proj-1', OWNER, { numero_version: '1.1', heredar: ['a2'] })

    expect(createdFiles()).toHaveLength(1)
    expect(createdFiles()[0].tipo).toBe('portada')
  })

  it('crea la versión sin archivos cuando heredar viene vacío', async () => {
    await createVersion('proj-1', OWNER, { numero_version: '1.1', heredar: [] })

    expect(createdFiles()).toEqual([])
  })

  it('reutiliza la ruta del objeto, sin duplicarlo en el bucket', async () => {
    await createVersion('proj-1', OWNER, { numero_version: '1.1' })

    expect(createdFiles().map(a => a.ruta_storage))
      .toEqual(['k/game.zip', 'k/cover.png', 'k/shot.png'])
  })

  it('desactiva la versión anterior y marca la nueva como activa', async () => {
    await createVersion('proj-1', OWNER, { numero_version: '1.1' })

    expect(mockPrisma.versionProyecto.updateMany).toHaveBeenCalledWith({
      where: { id_proyecto: 'proj-1', es_activa: true },
      data: { es_activa: false },
    })
    expect(mockPrisma.versionProyecto.create.mock.calls[0][0].data.es_activa).toBe(true)
  })

  it('funciona en el primer proyecto, sin versión activa previa', async () => {
    mockPrisma.versionProyecto.findFirst.mockResolvedValue(null)

    await createVersion('proj-1', OWNER, { numero_version: '1.0' })

    expect(createdFiles()).toEqual([])
  })
})
