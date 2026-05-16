const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const searchProjects = async ({ q, categoria, etiquetas = [], page = 1, limit = 12 } = {}) => {
  const skip = (page - 1) * limit
  const where = {
    estado: 'publicado',
    visibilidad: 'publico',
    ...(q && { OR: [
      { nombre: { contains: q, mode: 'insensitive' } },
      { descripcion: { contains: q, mode: 'insensitive' } },
    ]}),
    ...(categoria && { id_categoria: Number(categoria) }),
    ...(etiquetas.length > 0 && { etiquetas: { some: { id_etiqueta: { in: etiquetas.map(Number) } } } }),
  }

  const [projects, total] = await Promise.all([
    prisma.proyecto.findMany({
      where, skip, take: limit,
      select: {
        id: true, nombre: true, descripcion: true, slug: true,
        fecha_publicacion: true, destacado: true,
        categoria: true,
        etiquetas: { include: { etiqueta: true } },
        usuario: { select: { nombre: true } },
        _count: { select: { visitas: true } },
        versiones: {
          where: { es_activa: true },
          include: { archivos: { where: { tipo: 'portada' }, take: 1 } },
          take: 1,
        },
      },
      orderBy: [{ destacado: 'desc' }, { fecha_publicacion: 'desc' }],
    }),
    prisma.proyecto.count({ where }),
  ])

  return { projects, total, page, limit }
}

const getCategorias = async () => prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });

const getEtiquetas = async () => prisma.etiqueta.findMany({ orderBy: { nombre: 'asc' } });

module.exports = { searchProjects, getCategorias, getEtiquetas };