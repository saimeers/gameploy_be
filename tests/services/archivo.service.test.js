const mockPrisma = {
  archivo: { delete: jest.fn(), count: jest.fn() },
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('../../src/services/storage.service', () => ({
  deleteFile: jest.fn(() => Promise.resolve()),
}))

const { deleteFile } = require('../../src/services/storage.service')
const { removeArchivo } = require('../../src/services/archivo.service')

const archivo = { id: 'file-1', ruta_storage: 'projects/p1/versions/v1/game.zip' }

describe('removeArchivo', () => {
  it('borra siempre la fila del archivo', async () => {
    mockPrisma.archivo.count.mockResolvedValue(0)

    await removeArchivo(archivo)

    expect(mockPrisma.archivo.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } })
  })

  it('borra el objeto del bucket cuando ninguna otra versión lo referencia', async () => {
    mockPrisma.archivo.count.mockResolvedValue(0)

    await removeArchivo(archivo)

    expect(deleteFile).toHaveBeenCalledWith(archivo.ruta_storage)
  })

  it('conserva el objeto cuando otra versión lo heredó', async () => {
    mockPrisma.archivo.count.mockResolvedValue(1)

    await removeArchivo(archivo)

    expect(mockPrisma.archivo.delete).toHaveBeenCalled()
    expect(deleteFile).not.toHaveBeenCalled()
  })
})
