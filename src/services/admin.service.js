const { PrismaClient } = require('@prisma/client');

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

const toggleFeatured = async (projectId, destacado) => {
  return prisma.proyecto.update({ where: { id: projectId }, data: { destacado } });
};

const adminDeleteProject = async (projectId) => {
  return prisma.proyecto.delete({ where: { id: projectId } });
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

module.exports = { getStats, getAllProjects, toggleFeatured, adminDeleteProject, approveUser };