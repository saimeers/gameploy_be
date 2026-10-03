const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { removeArchivo } = require('./archivo.service');
const { deleteProjectAndFiles } = require('./project.service');
const { loadBuild, describeBuild } = require('./play.service');
const { getPresignedUrl } = require('./storage.service');
const { invalidatePublicData } = require('./cache.service');

const prisma = new PrismaClient();

const getStats = async () => {
  const rolPendiente = await prisma.rol.findUnique({ where: { nombre: 'pendiente' } })

  const [totalProjects, totalUsers, totalVisits, pendingUsers, recentProjects] = await Promise.all([
    prisma.proyecto.count({ where: { estado: 'publicado' } }),
    prisma.usuario.count({ where: { activo: true } }),
    prisma.visita.count(),
    prisma.usuario.count({ where: { id_rol: rolPendiente?.id } }),
    prisma.proyecto.findMany({
      where: { estado: 'publicado' },
      orderBy: { fecha_publicacion: 'desc' },
      take: 5,
      select: { id: true, nombre: true, slug: true, fecha_publicacion: true },
    }),
  ])

  const topProjects = await prisma.visita.groupBy({
    by: ['id_proyecto'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  return { totalProjects, totalUsers, totalVisits, recentProjects, topProjects, pendingUsers };
};

const getAllProjects = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;
  const [projects, total] = await Promise.all([
    prisma.proyecto.findMany({
      skip,
      take: limit,
      include: {
        usuario: { select: { nombre: true, correo: true } },
        categoria: true,
      },
      orderBy: { fecha_creacion: 'desc' },
    }),
    prisma.proyecto.count(),
  ]);
  return { projects, total, page, limit };
};

/**
 * Full read-only view of a single project for the admin panel.
 * Unlike getProjectBySlug it ignores visibility, so drafts and private
 * projects are also readable by an administrator.
 */
const getProjectById = async (projectId) => {
  const project = await prisma.proyecto.findUnique({
    where: { id: projectId },
    include: {
      usuario: { select: { id: true, nombre: true, correo: true } },
      categoria: true,
      etiquetas: { include: { etiqueta: true } },
      controles: { orderBy: { orden: 'asc' } },
      versiones: {
        include: { archivos: true },
        orderBy: { fecha_subida: 'desc' },
      },
      comentarios: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      },
      _count: { select: { visitas: true, comentarios: true } },
    },
  });

  if (!project) throw new NotFoundError('Project not found');

  return project;
};

const toggleFeatured = async (projectId, destacado) => {
  const project = await prisma.proyecto.update({ where: { id: projectId }, data: { destacado } });
  await invalidatePublicData();
  return project;
};

const adminDeleteProject = async (projectId) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new NotFoundError('Project not found');
  await deleteProjectAndFiles(projectId);
};

/**
 * What a game build contains: every file with its size, plus the checks the
 * upload form runs (compressed build, PWA template), for the admin to review.
 */
const getBuildContents = async (fileId) => {
  const archivo = await prisma.archivo.findUnique({ where: { id: fileId } });
  if (!archivo) throw new NotFoundError('File not found');
  if (archivo.tipo !== 'juego_webgl') throw new ValidationError('Only game builds have contents');

  // Published builds keep their manifest; older ones are read from the zip.
  if (archivo.manifiesto) return archivo.manifiesto;
  return describeBuild(await loadBuild(archivo.ruta_storage));
};

/** Short-lived link to download the original upload of any file. */
const getDownloadUrl = async (fileId) => {
  const archivo = await prisma.archivo.findUnique({ where: { id: fileId } });
  if (!archivo) throw new NotFoundError('File not found');
  return { url: await getPresignedUrl(archivo.ruta_storage, 300, archivo.nombre_archivo) };
};

/**
 * Permanently delete one file, from the bucket and from the database, whoever
 * owns the project it belongs to.
 */
const adminDeleteFile = async (fileId) => {
  const archivo = await prisma.archivo.findUnique({ where: { id: fileId } });
  if (!archivo) throw new NotFoundError('File not found');

  await removeArchivo(archivo);
  await invalidatePublicData();
};

const approveUser = async (userId) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { rol: true },
  });
  if (!user) throw new NotFoundError('User not found');
  if (user.rol.nombre !== 'pendiente') {
    throw new ConflictError('User is not pending approval');
  }
  if (!user.rol_solicitado) {
    throw new ValidationError('User has no requested role to approve');
  }

  const rolAprobado = await prisma.rol.findUnique({
    where: { nombre: user.rol_solicitado },
  });

  return prisma.usuario.update({
    where: { id: userId },
    data: {
      id_rol: rolAprobado.id,
      rol_solicitado: null, 
    },
    include: { rol: true },
  });
};

module.exports = {
  getStats,
  getAllProjects,
  getProjectById,
  toggleFeatured,
  adminDeleteProject,
  getBuildContents,
  getDownloadUrl,
  adminDeleteFile,
  approveUser,
};