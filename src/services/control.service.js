const { PrismaClient } = require('@prisma/client')
const { NotFoundError, ForbiddenError } = require('../utils/errors')
const { invalidatePublicData } = require('./cache.service')

const prisma = new PrismaClient()

const getControls = async (projectId) => {
  return prisma.controlJuego.findMany({
    where: { id_proyecto: projectId },
    orderBy: { orden: 'asc' },
  })
}

const createControl = async (projectId, userId, data) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } })
  if (!project) throw new NotFoundError('Project not found')
  if (project.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  const lastControl = await prisma.controlJuego.findFirst({
    where: { id_proyecto: projectId },
    orderBy: { orden: 'desc' },
  })
  const orden = (lastControl?.orden ?? -1) + 1

  const control = await prisma.controlJuego.create({
    data: { ...data, id_proyecto: projectId, orden },
  })
  await invalidatePublicData()
  return control
}

const updateControl = async (controlId, userId, data) => {
  const control = await prisma.controlJuego.findUnique({
    where: { id: controlId },
    include: { proyecto: true },
  })
  if (!control) throw new NotFoundError('Control not found')
  if (control.proyecto.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  const updated = await prisma.controlJuego.update({ where: { id: controlId }, data })
  await invalidatePublicData()
  return updated
}

const deleteControl = async (controlId, userId) => {
  const control = await prisma.controlJuego.findUnique({
    where: { id: controlId },
    include: { proyecto: true },
  })
  if (!control) throw new NotFoundError('Control not found')
  if (control.proyecto.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  await prisma.controlJuego.delete({ where: { id: controlId } })
  await invalidatePublicData()
}

const reorderControls = async (projectId, userId, order) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } })
  if (!project) throw new NotFoundError('Project not found')
  if (project.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  await Promise.all(
    order.map(({ id, orden }) =>
      prisma.controlJuego.update({ where: { id }, data: { orden } })
    )
  )
  await invalidatePublicData()
}

module.exports = { getControls, createControl, updateControl, deleteControl, reorderControls }