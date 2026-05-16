const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { generateSlug } = require('../utils/slug');

const prisma = new PrismaClient();

const createProject = async (userId, { nombre, descripcion, instrucciones, id_categoria, etiquetas = [] }) => {
  const slug = generateSlug(nombre);

  return prisma.proyecto.create({
    data: {
      nombre,
      descripcion,
      instrucciones,
      slug,
      id_usuario: userId,
      id_categoria: id_categoria || null,
      etiquetas: {
        create: etiquetas.map((id) => ({ id_etiqueta: id })),
      },
    },
    include: { categoria: true, etiquetas: { include: { etiqueta: true } } },
  });
};

const getProjectBySlug = async (slug, requestingUser = null) => {
  const project = await prisma.proyecto.findUnique({
    where: { slug },
    include: {
      usuario: { select: { id: true, nombre: true } },
      categoria: true,
      etiquetas: { include: { etiqueta: true } },
      versiones: {
        where: { es_activa: true },
        include: { archivos: true },
        take: 1,
      },
      controles: { orderBy: { orden: 'asc' } },
      comentarios: {
        where: { activo: true },
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      },
    },
  });

  if (!project) throw new NotFoundError('Project not found');

  // Visibility check
  if (project.visibilidad === 'privado') {
    if (!requestingUser || requestingUser.dbUser.id !== project.id_usuario) {
      throw new ForbiddenError('This project is private');
    }
  }

  return project;
};

const getMyProjects = async (userId, { page = 1, limit = 12 } = {}) => {
  const skip = (page - 1) * limit
  const [projects, total] = await Promise.all([
    prisma.proyecto.findMany({
      where: { id_usuario: userId },
      skip,
      take: limit,
      include: {
        categoria: true,
        etiquetas: { include: { etiqueta: true } },
        versiones: {
          where: { es_activa: true },
          include: {
            archivos: {
              where: { tipo: 'portada' },
              take: 1,
            },
          },
          take: 1,
        },
        _count: { select: { visitas: true, comentarios: true } },
      },
      orderBy: { fecha_creacion: 'desc' },
    }),
    prisma.proyecto.count({ where: { id_usuario: userId } }),
  ])
  return { projects, total, page, limit }
}

const updateProject = async (projectId, userId, data) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.id_usuario !== userId) throw new ForbiddenError('You do not own this project');

  const { etiquetas, ...rest } = data;

  return prisma.proyecto.update({
    where: { id: projectId },
    data: {
      ...rest,
      ...(etiquetas !== undefined && {
        etiquetas: {
          deleteMany: {},
          create: etiquetas.map((id) => ({ id_etiqueta: id })),
        },
      }),
    },
    include: { categoria: true, etiquetas: { include: { etiqueta: true } } },
  });
};

const publishProject = async (projectId, userId) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.id_usuario !== userId) throw new ForbiddenError('You do not own this project');

  return prisma.proyecto.update({
    where: { id: projectId },
    data: { estado: 'publicado', fecha_publicacion: new Date() },
  });
};

const deleteProject = async (projectId, requestingUser) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');

  const isOwner = project.id_usuario === requestingUser.dbUser.id;
  const isAdmin = requestingUser.dbUser.rol.nombre === 'admin';
  if (!isOwner && !isAdmin) throw new ForbiddenError('Not authorized to delete this project');

  await prisma.proyecto.delete({ where: { id: projectId } });
};

const recordVisit = async (projectId, origen = null) => {
  await prisma.visita.create({ data: { id_proyecto: projectId, origen } }).catch(() => {});
};

module.exports = {
  createProject,
  getProjectBySlug,
  getMyProjects,
  updateProject,
  publishProject,
  deleteProject,
  recordVisit,
};