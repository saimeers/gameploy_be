const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { sendNewCommentNotification } = require('./email.service');

const prisma = new PrismaClient();

const addComment = async (projectId, userId, { contenido, calificacion }) => {
  const project = await prisma.proyecto.findUnique({
    where: { id: projectId },
    include: { usuario: true },
  });
  if (!project) throw new NotFoundError('Project not found');

  const commenter = await prisma.usuario.findUnique({ where: { id: userId } });

  const comment = await prisma.comentario.create({
    data: {
      id_proyecto: projectId,
      id_usuario: userId,
      contenido,
      calificacion: calificacion ?? null,
    },
    include: { usuario: { select: { nombre: true } } },
  });

  // Non-blocking email to project owner
  if (project.usuario.id !== userId) {
    sendNewCommentNotification({
      toEmail: project.usuario.correo,
      studentName: project.usuario.nombre,
      projectName: project.nombre,
      commenterName: commenter.nombre,
      projectSlug: project.slug,
    }).catch(console.error);
  }

  return comment;
};

const getComments = async (projectId) => {
  return prisma.comentario.findMany({
    where: { id_proyecto: projectId, activo: true },
    include: { usuario: { select: { nombre: true } } },
    orderBy: { fecha: 'desc' },
  });
};

const moderateComment = async (commentId, activo) => {
  const comment = await prisma.comentario.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Comment not found');

  return prisma.comentario.update({ where: { id: commentId }, data: { activo } });
};

/**
 * Permanently delete a comment. Moderation keeps the record by flipping
 * `activo`; this removes the row, so it is reserved for the administrator.
 */
const deleteComment = async (commentId) => {
  const comment = await prisma.comentario.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Comment not found');

  await prisma.comentario.delete({ where: { id: commentId } });

  return comment;
};

module.exports = { addComment, getComments, moderateComment, deleteComment };