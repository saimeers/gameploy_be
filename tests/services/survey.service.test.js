const mockPrisma = {
  usuario: { update: jest.fn(), updateMany: jest.fn() },
  proyecto: { count: jest.fn() },
  comentario: { count: jest.fn() },
  respuestaEncuesta: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(fn => fn(mockPrisma)),
}

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => mockPrisma) }))

const survey = require('../../src/services/survey.service')

const DAY = 24 * 60 * 60 * 1000
const todayUtc = () => new Date(new Date().toISOString().slice(0, 10))
const user = (rol, extra = {}) => ({
  id: 'u1', rol: { nombre: rol }, fecha_registro: new Date(), dias_activos: 0, ultimo_dia_activo: todayUtc(),
  encuesta_respondida: false, encuesta_pospuestas: 0, encuesta_pospuesta_hasta: null, ...extra,
})
const ANSWER = {
  version: 1,
  momento: 'voluntaria',
  sus: [4, 2, 4, 2, 4, 2, 4, 2, 4, 2],
  ux: [4, 4, 4, 2, 4, 4, 4, 2, 4, 4],
}

beforeEach(() => {
  mockPrisma.proyecto.count.mockResolvedValue(0)
  mockPrisma.comentario.count.mockResolvedValue(0)
  mockPrisma.usuario.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.usuario.update.mockImplementation(async ({ data }) => ({ ...data, dias_activos: 1 }))
})

describe('puntajes', () => {
  it('SUS: todo neutral da 50, lo ideal 100 y lo peor 0', () => {
    expect(survey.scoreSus(Array(10).fill(3))).toBe(50)
    expect(survey.scoreSus([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100)
    expect(survey.scoreSus([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0)
    expect(survey.scoreSus(ANSWER.sus)).toBe(75)
  })

  it('experiencia: invierte los ítems 4 y 8 y va de 0 a 100', () => {
    expect(survey.scoreUx([5, 5, 5, 1, 5, 5, 5, 1, 5, 5])).toBe(100)
    expect(survey.scoreUx([1, 1, 1, 5, 1, 1, 1, 5, 1, 1])).toBe(0)
    expect(survey.scoreUx(Array(10).fill(3))).toBe(50)
    expect(survey.scoreUx(ANSWER.ux)).toBe(75)
  })

  it('clasifica el promedio SUS en bandas, con 68 como referencia', () => {
    expect(survey.bandFor(45).id).toBe('pobre')
    expect(survey.bandFor(60).id).toBe('mejorable')
    expect(survey.bandFor(68).id).toBe('buena')
    expect(survey.bandFor(85).id).toBe('excelente')
    expect(survey.bandFor(100).id).toBe('excelente')
  })

  it('describe: media, desviación e intervalo de confianza del 95 %', () => {
    const d = survey.describe([70, 80, 90])
    expect(d).toMatchObject({ n: 3, media: 80, desviacion: 10 })
    // t(2) = 4.303 → 80 ± 4.303·10/√3 ≈ 80 ± 24.8
    expect(d.ic95).toEqual([55.2, 100])
    expect(survey.describe([]).media).toBeNull()
    expect(survey.describe([60]).ic95).toBeNull()
  })
})

describe('submit', () => {
  it('guarda la respuesta sin usuario, correo ni IP, con los puntajes calculados en el servidor', async () => {
    await survey.submit({ ...ANSWER, sus_puntaje: 0, edad: '18_24', comentario: '  Mejorar la guía  ' }, null)

    const { data } = mockPrisma.respuestaEncuesta.create.mock.calls[0][0]
    expect(data).toEqual({
      version: 1, momento: 'voluntaria', perfil: 'visitante', edad: '18_24',
      sus: ANSWER.sus, ux: ANSWER.ux, sus_puntaje: 75, ux_puntaje: 75, comentario: 'Mejorar la guía',
    })
    expect(Object.keys(data)).not.toEqual(expect.arrayContaining(['id_usuario']))
    expect(data).not.toHaveProperty('fecha') // la fecha la pone la base, sin hora
  })

  it('con cuenta guarda el perfil y marca la cuenta en la misma transacción', async () => {
    await survey.submit(ANSWER, user('estudiante'))

    expect(mockPrisma.$transaction).toHaveBeenCalled()
    expect(mockPrisma.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', encuesta_respondida: false },
      data: { encuesta_respondida: true },
    })
    expect(mockPrisma.respuestaEncuesta.create.mock.calls[0][0].data.perfil).toBe('estudiante')
  })

  it('una cuenta responde una sola vez (409)', async () => {
    mockPrisma.usuario.updateMany.mockResolvedValue({ count: 0 })

    await expect(survey.submit(ANSWER, user('docente'))).rejects.toMatchObject({ statusCode: 409 })
    expect(mockPrisma.respuestaEncuesta.create).not.toHaveBeenCalled()
  })

  it('los administradores no responden', async () => {
    await expect(survey.submit(ANSWER, user('admin'))).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each([
    ['otra versión', { version: 2 }],
    ['momento desconocido', { momento: 'nunca' }],
    ['faltan ítems', { sus: [3, 3, 3] }],
    ['fuera de la escala', { ux: [6, 4, 4, 2, 4, 4, 4, 2, 4, 4] }],
    ['no entero', { sus: [3.5, 3, 3, 3, 3, 3, 3, 3, 3, 3] }],
    ['dato opcional no permitido', { genero: 'x' }],
    ['comentario demasiado largo', { comentario: 'a'.repeat(1001) }],
  ])('rechaza con 422: %s', async (_name, change) => {
    await expect(survey.submit({ ...ANSWER, ...change }, null)).rejects.toMatchObject({ statusCode: 422 })
    expect(mockPrisma.respuestaEncuesta.create).not.toHaveBeenCalled()
  })
})

describe('getStatus', () => {
  it('sin cuenta: decide el navegador', async () => {
    expect(await survey.getStatus(null)).toMatchObject({ puede_responder: true, invitar: false })
  })

  it('el estudiante que publicó su primer proyecto recibe la invitación', async () => {
    mockPrisma.proyecto.count.mockResolvedValue(1)

    expect(await survey.getStatus(user('estudiante'))).toMatchObject({ invitar: true, momento: 'primer_proyecto' })
  })

  it('el docente que hizo su primera evaluación recibe la invitación', async () => {
    mockPrisma.comentario.count.mockResolvedValue(1)

    expect(await survey.getStatus(user('docente'))).toMatchObject({ invitar: true, momento: 'primer_proyecto' })
  })

  it('uso prolongado: 7 días desde el registro y 3 días de uso', async () => {
    const veteran = user('estudiante', { fecha_registro: new Date(Date.now() - 8 * DAY), dias_activos: 3 })
    expect(await survey.getStatus(veteran)).toMatchObject({ invitar: true, momento: 'uso_prolongado' })

    const recent = user('estudiante', { fecha_registro: new Date(Date.now() - 2 * DAY), dias_activos: 3 })
    expect(await survey.getStatus(recent)).toMatchObject({ invitar: false })
  })

  it('cuenta un día de uso la primera vez que se abre la plataforma ese día', async () => {
    await survey.getStatus(user('estudiante', { ultimo_dia_activo: new Date('2020-01-01') }))
    expect(mockPrisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { ultimo_dia_activo: todayUtc(), dias_activos: { increment: 1 } },
    }))

    mockPrisma.usuario.update.mockClear()
    await survey.getStatus(user('estudiante'))
    expect(mockPrisma.usuario.update).not.toHaveBeenCalled()
  })

  it('no invita a quien ya respondió, pospuso hace poco o pospuso dos veces', async () => {
    mockPrisma.proyecto.count.mockResolvedValue(1)

    expect(await survey.getStatus(user('estudiante', { encuesta_respondida: true })))
      .toMatchObject({ respondida: true, invitar: false, puede_responder: false })
    expect(await survey.getStatus(user('estudiante', { encuesta_pospuesta_hasta: new Date(Date.now() + DAY) })))
      .toMatchObject({ invitar: false, pospuesta: true, puede_responder: true })
    expect(await survey.getStatus(user('estudiante', { encuesta_pospuestas: 2 })))
      .toMatchObject({ invitar: false, pospuesta: true })
    expect(await survey.getStatus(user('estudiante', { encuesta_pospuestas: 1, encuesta_pospuesta_hasta: new Date(Date.now() - DAY) })))
      .toMatchObject({ invitar: true })
  })

  it('el admin y las cuentas pendientes no responden', async () => {
    expect(await survey.getStatus(user('admin'))).toMatchObject({ puede_responder: false, invitar: false })
    expect(await survey.getStatus(user('pendiente'))).toMatchObject({ puede_responder: false })
  })
})

describe('postpone', () => {
  it('"Ahora no" la oculta 3 días y suma una posposición', async () => {
    await survey.postpone(user('estudiante'))

    const { data } = mockPrisma.usuario.update.mock.calls[0][0]
    expect(data.encuesta_pospuestas).toEqual({ increment: 1 })
    const days = (data.encuesta_pospuesta_hasta - Date.now()) / DAY
    expect(days).toBeGreaterThan(2.9)
    expect(days).toBeLessThanOrEqual(3)
  })
})

describe('summary y exportCsv', () => {
  const row = (fecha, sus, ux, extra = {}) => ({
    fecha: new Date(fecha), version: 1, perfil: 'estudiante', momento: 'voluntaria',
    edad: null, genero: null, experiencia_videojuegos: null, frecuencia_juego: null, juegos_serios_previos: null,
    sus, ux, sus_puntaje: survey.scoreSus(sus), ux_puntaje: survey.scoreUx(ux), comentario: null, ...extra,
  })
  const ROWS = [
    row('2026-09-10', [5, 1, 5, 1, 5, 1, 5, 1, 5, 1], [5, 5, 5, 1, 5, 5, 5, 1, 5, 5], { perfil: 'docente' }),
    row('2026-10-02', Array(10).fill(3), Array(10).fill(3), { comentario: 'Más ejemplos, "por favor"', genero: 'femenino' }),
  ]

  it('resume puntajes, bandas, ítems, tendencia, participación y comentarios', async () => {
    mockPrisma.respuestaEncuesta.findMany.mockResolvedValue(ROWS)

    const s = await survey.summary({})

    expect(s.total).toBe(2)
    expect(s.usabilidad).toMatchObject({ n: 2, media: 75, banda: 'buena', referencia: 68 })
    expect(s.usabilidad.bandas.find(b => b.id === 'excelente').respuestas).toBe(1)
    expect(s.usabilidad.bandas.find(b => b.id === 'pobre').respuestas).toBe(1)
    // ítem 2 (negativo): 1 es lo mejor (100) y 3 es neutral (50)
    expect(s.usabilidad.items[1]).toEqual({ item: 2, acuerdo: 2, favorable: 75 })
    expect(s.experiencia.items[3]).toEqual({ item: 4, acuerdo: 2, favorable: 75 })
    expect(s.experiencia.inversos).toEqual([4, 8])
    expect(s.tendencia).toEqual([
      { mes: '2026-09', n: 1, usabilidad: 100, experiencia: 100 },
      { mes: '2026-10', n: 1, usabilidad: 50, experiencia: 50 },
    ])
    expect(s.participacion.perfil).toEqual({ docente: 1, estudiante: 1 })
    expect(s.participacion.genero).toEqual({ sin_respuesta: 1, femenino: 1 })
    expect(s.comentarios).toEqual([{ fecha: '2026-10-02', perfil: 'estudiante', texto: 'Más ejemplos, "por favor"' }])
  })

  it('sin respuestas devuelve nulos, no errores', async () => {
    mockPrisma.respuestaEncuesta.findMany.mockResolvedValue([])

    const s = await survey.summary({})
    expect(s.total).toBe(0)
    expect(s.usabilidad.media).toBeNull()
    expect(s.usabilidad.items).toEqual([])
  })

  it('aplica los filtros de periodo, perfil y momento', async () => {
    mockPrisma.respuestaEncuesta.findMany.mockResolvedValue([])

    await survey.summary(survey.parseFilters({ dias: '30', perfil: 'docente', momento: 'tras_jugar', otro: 'x' }))

    const { where } = mockPrisma.respuestaEncuesta.findMany.mock.calls[0][0]
    expect(where).toMatchObject({ perfil: 'docente', momento: 'tras_jugar' })
    expect(where.fecha.gte.getTime()).toBe(todayUtc().getTime() - 30 * DAY)
    expect(survey.parseFilters({ dias: 'abc', perfil: 'admin' })).toEqual({ dias: undefined, perfil: undefined, momento: undefined })
  })

  it('exporta una fila por respuesta, con BOM y comillas escapadas', async () => {
    mockPrisma.respuestaEncuesta.findMany.mockResolvedValue(ROWS)

    const csv = await survey.exportCsv({})
    const lines = csv.replace('﻿', '').trim().split('\r\n')

    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines[0]).toBe('fecha,version,perfil,momento,edad,genero,experiencia_videojuegos,frecuencia_juego,juegos_serios_previos,'
      + 'sus1,sus2,sus3,sus4,sus5,sus6,sus7,sus8,sus9,sus10,ux1,ux2,ux3,ux4,ux5,ux6,ux7,ux8,ux9,ux10,sus_puntaje,ux_puntaje,comentario')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('2026-10-02,1,estudiante,voluntaria,,femenino,,,,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,50,50,"Más ejemplos, ""por favor"""')
  })
})
