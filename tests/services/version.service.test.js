const mockPrisma = {
  proyecto:        { findUnique: jest.fn() },
  versionProyecto: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  archivo:         { delete: jest.fn(), count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('../../src/services/storage.service', () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(() => Promise.resolve()),
  getPresignedUrl: jest.fn(async () => 'https://bucket.test/descarga'),
  buildStorageKey: jest.fn(() => 'key'),
}))
jest.mock('../../src/services/publish.service', () => ({
  isPublishingEnabled: jest.fn(() => true),
  publishArchivo: jest.fn(async () => ({ ruta_publica: 'builds/nuevo/', manifiesto: { files: [] } })),
  removePublished: jest.fn(() => Promise.resolve()),
}))

const { deleteFile, getPresignedUrl } = require('../../src/services/storage.service')
const { publishArchivo } = require('../../src/services/publish.service')
const {
  createVersion, uploadVersionFile, getVersions, getDownloadUrl,
} = require('../../src/services/version.service')

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

describe('herencia de la copia publicada', () => {
  it('la versión nueva reutiliza la copia publicada y el manifiesto de los archivos que hereda', async () => {
    mockPrisma.versionProyecto.findFirst.mockResolvedValue({
      id: 'v1',
      archivos: [{ ...ARCHIVOS[0], ruta_publica: 'builds/b1/', manifiesto: { files: [] } }],
    })

    await createVersion('proj-1', OWNER, { numero_version: '1.1' })

    expect(createdFiles()[0]).toMatchObject({ ruta_publica: 'builds/b1/', manifiesto: { files: [] } })
  })
})

describe('uploadVersionFile', () => {
  const FILE = { originalname: 'Juego.zip', buffer: Buffer.from('zip'), mimetype: 'application/zip', size: 3 }

  beforeEach(() => {
    mockPrisma.versionProyecto.findUnique.mockResolvedValue({
      id: 'v1', id_proyecto: 'proj-1', proyecto: PROJECT, archivos: [],
    })
    mockPrisma.archivo.create.mockImplementation(async ({ data }) => ({ id: 'nuevo', ...data }))
  })

  it('publica la copia para los jugadores y la guarda en el archivo', async () => {
    const archivo = await uploadVersionFile('v1', OWNER, FILE, 'juego_webgl')

    expect(publishArchivo).toHaveBeenCalledWith({ tipo: 'juego_webgl', nombre_archivo: 'Juego.zip' }, FILE.buffer, 'application/zip')
    expect(archivo).toMatchObject({ ruta_storage: 'key', ruta_publica: 'builds/nuevo/' })
  })

  it('si publicar falla, borra el original subido y no crea el archivo', async () => {
    publishArchivo.mockRejectedValueOnce(new Error('R2 caído'))

    await expect(uploadVersionFile('v1', OWNER, FILE, 'juego_webgl')).rejects.toThrow('R2 caído')
    expect(deleteFile).toHaveBeenCalledWith('key')
    expect(mockPrisma.archivo.create).not.toHaveBeenCalled()
  })

  describe('reemplazar el juego de una versión', () => {
    const OLD = { id: 'viejo', tipo: 'juego_webgl', ruta_storage: 'k/viejo.zip', ruta_publica: 'builds/viejo/' }

    beforeEach(() => {
      mockPrisma.versionProyecto.findUnique.mockResolvedValue({
        id: 'v1', id_proyecto: 'proj-1', proyecto: PROJECT, archivos: [OLD, ARCHIVOS[2]],
      })
      mockPrisma.archivo.count.mockResolvedValue(0)
    })

    it('si la subida falla, el juego anterior sigue en la versión', async () => {
      publishArchivo.mockRejectedValueOnce(new Error('build sin index.html'))

      await expect(uploadVersionFile('v1', OWNER, FILE, 'juego_webgl')).rejects.toThrow('build sin index.html')
      expect(mockPrisma.archivo.delete).not.toHaveBeenCalled()
      expect(deleteFile).not.toHaveBeenCalledWith('k/viejo.zip')
    })

    it('si va bien, guarda el nuevo y después quita el anterior (no las capturas)', async () => {
      await uploadVersionFile('v1', OWNER, FILE, 'juego_webgl')

      expect(mockPrisma.archivo.delete).toHaveBeenCalledTimes(1)
      expect(mockPrisma.archivo.delete).toHaveBeenCalledWith({ where: { id: 'viejo' } })
      const created = mockPrisma.archivo.create.mock.invocationCallOrder[0]
      const removed = mockPrisma.archivo.delete.mock.invocationCallOrder[0]
      expect(created).toBeLessThan(removed)
    })
  })
})

describe('getVersions', () => {
  const STUDENT = { dbUser: { id: OWNER, rol: { nombre: 'estudiante' } } }
  const STRANGER = { dbUser: { id: 'otro', rol: { nombre: 'estudiante' } } }
  const ADMIN = { dbUser: { id: 'admin', rol: { nombre: 'admin' } } }

  it('solo las ve el dueño o un admin, porque llevan los archivos del juego', async () => {
    mockPrisma.versionProyecto.findMany.mockResolvedValue([])

    await expect(getVersions('proj-1', STUDENT)).resolves.toEqual([])
    await expect(getVersions('proj-1', ADMIN)).resolves.toEqual([])
    await expect(getVersions('proj-1', STRANGER)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('getDownloadUrl', () => {
  it('da al dueño un enlace corto que descarga con el nombre original', async () => {
    mockPrisma.archivo.findUnique.mockResolvedValue({
      ruta_storage: 'k/game.zip', nombre_archivo: 'Juego.zip', version: { proyecto: PROJECT },
    })

    await expect(getDownloadUrl('a1', OWNER)).resolves.toEqual({ url: 'https://bucket.test/descarga' })
    expect(getPresignedUrl).toHaveBeenCalledWith('k/game.zip', 300, 'Juego.zip')
    await expect(getDownloadUrl('a1', 'otro')).rejects.toMatchObject({ statusCode: 403 })
  })
})
