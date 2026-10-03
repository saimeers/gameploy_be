const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');

const prisma = new PrismaClient();

/**
 * Categories and tags share the same lifecycle: they are created, renamed and
 * deactivated by an admin, and only deleted for good while no project uses
 * them. Deleting one that is in use would silently strip it from those
 * projects (categories are set to null, tags cascade), so it is refused.
 */
const KINDS = {
  categoria: { model: 'categoria', label: 'Category', fields: ['nombre', 'descripcion'] },
  etiqueta: { model: 'etiqueta', label: 'Tag', fields: ['nombre'] },
};

const kindOf = (kind) => {
  const cfg = KINDS[kind];
  if (!cfg) throw new ValidationError(`Unknown catalog kind: ${kind}`);
  return cfg;
};

const pick = (data, fields) =>
  Object.fromEntries(fields.filter(f => data?.[f] !== undefined).map(f => [f, data[f]]));

const withUsage = { _count: { select: { proyectos: true } } };

/** Map Prisma's unique-name and not-found errors to API errors. */
const translate = (cfg) => (err) => {
  if (err.code === 'P2002') throw new ConflictError(`${cfg.label} name already exists`);
  if (err.code === 'P2025') throw new NotFoundError(`${cfg.label} not found`);
  throw err;
};

/** Every item, active or not, with how many projects use it. */
const list = (kind) => {
  const cfg = kindOf(kind);
  return prisma[cfg.model].findMany({ orderBy: { nombre: 'asc' }, include: withUsage });
};

/** Active items only: the ones offered when creating or editing a project. */
const listActive = (kind) => {
  const cfg = kindOf(kind);
  return prisma[cfg.model].findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } });
};

const create = (kind, data) => {
  const cfg = kindOf(kind);
  const values = pick(data, cfg.fields);
  if (!values.nombre?.trim()) throw new ValidationError('nombre is required');
  return prisma[cfg.model].create({ data: values, include: withUsage }).catch(translate(cfg));
};

const update = (kind, id, data) => {
  const cfg = kindOf(kind);
  return prisma[cfg.model]
    .update({ where: { id: Number(id) }, data: pick(data, cfg.fields), include: withUsage })
    .catch(translate(cfg));
};

const setStatus = (kind, id, activo) => {
  const cfg = kindOf(kind);
  if (typeof activo !== 'boolean') throw new ValidationError('activo must be a boolean');
  return prisma[cfg.model]
    .update({ where: { id: Number(id) }, data: { activo }, include: withUsage })
    .catch(translate(cfg));
};

const remove = async (kind, id) => {
  const cfg = kindOf(kind);
  const item = await prisma[cfg.model].findUnique({ where: { id: Number(id) }, include: withUsage });
  if (!item) throw new NotFoundError(`${cfg.label} not found`);

  const usage = item._count.proyectos;
  if (usage > 0) {
    throw new ConflictError(`${cfg.label} is used by ${usage} project(s); deactivate it instead`);
  }
  await prisma[cfg.model].delete({ where: { id: item.id } });
  return item;
};

/**
 * Reject assigning inactive categories or tags to a project. Those the project
 * already has are allowed, so editing it does not force dropping them.
 * @param {{ id_categoria?: number | null, etiquetas?: number[] }} data
 * @param {{ id_categoria?: number | null, etiquetas?: number[] }} [current]
 */
const assertActiveAssignments = async (data, current = {}) => {
  const categoria = data.id_categoria;
  if (categoria != null && categoria !== current.id_categoria) {
    const found = await prisma.categoria.findUnique({ where: { id: Number(categoria) } });
    if (!found?.activo) throw new ValidationError('The category does not exist or is inactive');
  }

  const kept = new Set(current.etiquetas ?? []);
  const added = (data.etiquetas ?? []).map(Number).filter(id => !kept.has(id));
  if (added.length) {
    const active = await prisma.etiqueta.count({ where: { id: { in: added }, activo: true } });
    if (active !== new Set(added).size) throw new ValidationError('Some tags do not exist or are inactive');
  }
};

module.exports = { list, listActive, create, update, setStatus, remove, assertActiveAssignments };
