const mockPrisma = {
  usuario: { findUnique: jest.fn(), update: jest.fn() },
}

const mockGetUser = jest.fn()

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))
jest.mock('../../src/config/firebase', () => ({ auth: () => ({ getUser: mockGetUser }) }))

const { getProfile, updateProfile } = require('../../src/services/user.service')

const USER = {
  id: 'user-1',
  firebase_uid: 'fb-1',
  nombre: 'Saimer',
  correo: 'saimer@ufps.edu.co',
  rol: { nombre: 'estudiante' },
  proyectos: [],
}

describe('getProfile', () => {
  it('falla si el usuario no existe', async () => {
    mockPrisma.usuario.findUnique.mockResolvedValue(null)

    await expect(getProfile('nadie')).rejects.toThrow('User not found')
  })

  it('pide solo los proyectos publicados', async () => {
    mockPrisma.usuario.findUnique.mockResolvedValue(USER)
    mockGetUser.mockResolvedValue({ photoURL: null })

    await getProfile('user-1')

    const { include } = mockPrisma.usuario.findUnique.mock.calls[0][0]
    expect(include.proyectos.where).toEqual({ estado: 'publicado' })
  })

  it('añade la foto que guarda Firebase', async () => {
    mockPrisma.usuario.findUnique.mockResolvedValue(USER)
    mockGetUser.mockResolvedValue({ photoURL: 'https://foto' })

    const profile = await getProfile('user-1')

    expect(profile.foto_perfil).toBe('https://foto')
  })

  it('devuelve el perfil aunque Firebase no responda', async () => {
    mockPrisma.usuario.findUnique.mockResolvedValue(USER)
    mockGetUser.mockRejectedValue(new Error('firebase caído'))

    const profile = await getProfile('user-1')

    expect(profile.nombre).toBe('Saimer')
    expect(profile.foto_perfil).toBeNull()
  })

  it('no consulta a Firebase si el usuario no tiene uid', async () => {
    mockPrisma.usuario.findUnique.mockResolvedValue({ ...USER, firebase_uid: null })

    const profile = await getProfile('user-1')

    expect(mockGetUser).not.toHaveBeenCalled()
    expect(profile.foto_perfil).toBeNull()
  })
})

describe('updateProfile', () => {
  it('rechaza un nombre vacío', async () => {
    await expect(updateProfile('user-1', { nombre: '   ' })).rejects.toThrow('nombre is required')
    expect(mockPrisma.usuario.update).not.toHaveBeenCalled()
  })

  it('rechaza un nombre más largo que el límite', async () => {
    await expect(updateProfile('user-1', { nombre: 'a'.repeat(81) }))
      .rejects.toThrow('at most 80 characters')
  })

  it('recorta los espacios antes de guardar', async () => {
    mockPrisma.usuario.update.mockResolvedValue(USER)

    await updateProfile('user-1', { nombre: '  Saimer  ' })

    expect(mockPrisma.usuario.update.mock.calls[0][0].data).toEqual({ nombre: 'Saimer' })
  })
})
