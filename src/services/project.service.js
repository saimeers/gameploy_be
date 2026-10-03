const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError } = require('../utils/errors');
const { generateSlug, slugify, isValidSlug, SLUG_MIN, SLUG_MAX } = require('../utils/slug');

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

/**
 * Id of the project a slug points to: its current slug or one it had before,
 * so links shared before a slug change keep working.
 * @returns {Promise<string | null>}
 */
const resolveSlug = async (slug) => {
  const current = await prisma.proyecto.findUnique({ where: { slug }, select: { id: true } });
  if (current) return current.id;
  const previous = await prisma.slugAnterior.findUnique({ where: { slug }, select: { id_proyecto: true } });
  return previous?.id_proyecto ?? null;
};

const getProjectBySlug = async (slug, requestingUser = null) => {
  const id = await resolveSlug(slug);
  if (!id) throw new NotFoundError('Project not found');

  const project = await prisma.proyecto.findUnique({
    where: { id },
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

/** Fields a student may change with PATCH /projects/:id. */
const EDITABLE_FIELDS = ['nombre', 'descripcion', 'instrucciones', 'visibilidad', 'id_categoria'];

const updateProject = async (projectId, userId, data) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.id_usuario !== userId) throw new ForbiddenError('You do not own this project');

  // Anything else (slug, estado, destacado, id_usuario...) has its own
  // endpoint with its own checks, so it is ignored here.
  const { etiquetas } = data;
  const rest = Object.fromEntries(
    EDITABLE_FIELDS.filter(field => data[field] !== undefined).map(field => [field, data[field]]),
  );

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

const assertCanEdit = (project, requestingUser) => {
  const isOwner = project.id_usuario === requestingUser.dbUser.id;
  const isAdmin = requestingUser.dbUser.rol.nombre === 'admin';
  if (!isOwner && !isAdmin) throw new ForbiddenError('You do not own this project');
};

/**
 * Whether a project can use a slug. The input is normalised first, so
 * "Mi Juego" is checked as "mi-juego".
 * @returns {Promise<{ slug: string, valid: boolean, available: boolean, reason: string | null }>}
 */
const checkSlug = async (projectId, input, requestingUser) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  assertCanEdit(project, requestingUser);

  const slug = slugify(input);
  if (!isValidSlug(slug)) {
    return { slug, valid: false, available: false, reason: `Use ${SLUG_MIN} to ${SLUG_MAX} letters, numbers or hyphens` };
  }
  if (slug === project.slug) return { slug, valid: true, available: true, reason: null };

  const [current, previous] = await Promise.all([
    prisma.proyecto.findUnique({ where: { slug }, select: { id: true } }),
    prisma.slugAnterior.findUnique({ where: { slug }, select: { id_proyecto: true } }),
  ]);
  // A project may take back one of its own previous slugs.
  const takenByOther = current || (previous && previous.id_proyecto !== projectId);
  return {
    slug,
    valid: true,
    available: !takenByOther,
    reason: takenByOther ? 'Already in use' : null,
  };
};

/**
 * Change the slug of a project. The old slug is kept as a previous slug, so
 * links that were already shared redirect to the new one.
 */
const changeSlug = async (projectId, input, requestingUser) => {
  const check = await checkSlug(projectId, input, requestingUser);
  if (!check.valid) throw new ValidationError(check.reason);
  if (!check.available) throw new ConflictError('Slug already in use');

  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (check.slug === project.slug) return project;

  try {
    const [, , updated] = await prisma.$transaction([
      prisma.slugAnterior.deleteMany({ where: { slug: check.slug, id_proyecto: projectId } }),
      prisma.slugAnterior.create({ data: { slug: project.slug, id_proyecto: projectId } }),
      prisma.proyecto.update({ where: { id: projectId }, data: { slug: check.slug } }),
    ]);
    return updated;
  } catch (err) {
    // Another project took the slug between the check and the update.
    if (err.code === 'P2002') throw new ConflictError('Slug already in use');
    throw err;
  }
};

const deleteProject = async (projectId, requestingUser) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');

  const isOwner = project.id_usuario === requestingUser.dbUser.id;
  const isAdmin = requestingUser.dbUser.rol.nombre === 'admin';
  if (!isOwner && !isAdmin) throw new ForbiddenError('Not authorized to delete this project');

  await prisma.proyecto.delete({ where: { id: projectId } });
};

module.exports = {
  createProject,
  getProjectBySlug,
  getMyProjects,
  updateProject,
  publishProject,
  deleteProject,
  resolveSlug,
  checkSlug,
  changeSlug,
};