const { success, error } = require('../../src/utils/response')

const mockRes = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

describe('respuestas estandarizadas', () => {
  it('success responde 200 con data y sin meta', () => {
    const res = mockRes()
    success(res, { data: { id: 1 } })

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'OK', data: { id: 1 } })
  })

  it('success incluye meta solo cuando se le pasa', () => {
    const res = mockRes()
    success(res, { data: [], meta: { total: 0, page: 1, limit: 12 }, statusCode: 201 })

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json.mock.calls[0][0].meta).toEqual({ total: 0, page: 1, limit: 12 })
  })

  it('error responde 500 por defecto y nunca expone data', () => {
    const res = mockRes()
    error(res, {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    })
  })
})
