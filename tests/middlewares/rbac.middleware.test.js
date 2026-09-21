const { requireRoles } = require('../../src/middlewares/rbac.middleware')

const runWith = (rol) => {
  const req = rol ? { user: { dbUser: { rol: { nombre: rol } } } } : {}
  const next = jest.fn()
  return { next, req }
}

describe('requireRoles', () => {
  it('deja pasar al rol permitido', () => {
    const { req, next } = runWith('admin')
    requireRoles('admin')(req, {}, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('deja pasar a cualquiera de los roles listados', () => {
    const { req, next } = runWith('docente')
    requireRoles('docente', 'admin')(req, {}, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('rechaza con 403 a un rol no listado', () => {
    const { req, next } = runWith('estudiante')
    requireRoles('admin')(req, {}, next)

    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(403)
  })

  it('rechaza cuando la petición no trae usuario', () => {
    const { req, next } = runWith(null)
    requireRoles('admin')(req, {}, next)

    expect(next.mock.calls[0][0].statusCode).toBe(403)
  })
})
