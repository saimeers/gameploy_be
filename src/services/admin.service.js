const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const getStats = async () => {
  const [totalProjects, totalUsers, totalVisits, recentProjects] = await Promise.all([
    prisma.proyecto.count({ where: { estado: 'publicado' } }),
    prisma.usuario.count({ where: { activo: true } }),
    prisma.visita.count(),
    prisma.proyecto.findMany({
      where: { estado: 'publicado' },
      orderBy: { fecha_publicacion: 'desc' },
      take: 5,
      select: { id: true, nombre: true, slug: true, fecha_publicacion: true },
    }),
  ]);

  // Visits per project (top 5)
  const topProjects = await prisma.visita.groupBy({
    by: ['id_proyecto'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  return { totalProjects, totalUsers, totalVisits, recentProjects, topProjects };
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

module.exports = { getStats, getAllProjects, toggleFeatured, adminDeleteProject };