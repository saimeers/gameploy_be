const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const prisma = new PrismaClient();

const EMPTY_LOCATION = { codigo_pais: null, region: null, ciudad: null };

// geoip-lite keeps its whole database in memory (~110 MB), so it is only
// loaded with the first visit and not when the server starts.
let geoip = null;
const lookup = (ip) => {
  geoip ??= require('geoip-lite');
  return geoip.lookup(ip);
};

/**
 * Country, region and city of an IP, from the offline GeoLite database. The IP
 * never leaves the server and is not stored; private and unknown addresses
 * resolve to nulls.
 * @param {string | undefined} ip
 */
const locate = (ip) => {
  const clean = ip?.replace(/^::ffff:/, '');
  if (!clean) return EMPTY_LOCATION;
  try {
    const geo = lookup(clean);
    if (!geo) return EMPTY_LOCATION;
    return {
      codigo_pais: geo.country || null,
      region: geo.region || null,
      ciudad: geo.city || null,
    };
  } catch {
    return EMPTY_LOCATION;
  }
};

/**
 * Record a visit to a project. It never throws, and callers do not need to
 * await it: a failed record must not break the page being visited.
 * @param {string} projectId
 * @param {{ ip?: string, origen?: string | null }} visitor
 */
const recordVisit = (projectId, { ip, origen = null } = {}) =>
  prisma.visita
    .create({ data: { id_proyecto: projectId, origen, ...locate(ip) } })
    .catch(() => {});

/** `days` from a query string, or undefined for all time. */
const parseDays = (value) => {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 && days <= 365 ? days : undefined;
};

/**
 * Visits grouped by country and by city, most visited first.
 * @param {object} scope
 * @param {string} [scope.projectId] only this project
 * @param {string} [scope.ownerId] only the projects of this user
 * @param {number} [scope.days] only the last N days
 */
const getVisitStats = async ({ projectId, ownerId, days } = {}) => {
  const where = {};
  if (projectId) where.id_proyecto = projectId;
  if (ownerId) where.proyecto = { id_usuario: ownerId };
  if (days) where.fecha = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };

  const [total, byCountry, byCity] = await Promise.all([
    prisma.visita.count({ where }),
    prisma.visita.groupBy({
      by: ['codigo_pais'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.visita.groupBy({
      by: ['codigo_pais', 'region', 'ciudad'],
      where: { ...where, ciudad: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ]);

  return {
    total,
    days: days ?? null,
    countries: byCountry.map(row => ({ codigo_pais: row.codigo_pais, visitas: row._count.id })),
    cities: byCity.map(row => ({
      codigo_pais: row.codigo_pais,
      region: row.region,
      ciudad: row.ciudad,
      visitas: row._count.id,
    })),
  };
};

/** Visit stats of one project, for its owner or an admin. */
const getProjectVisitStats = async (projectId, requestingUser, days) => {
  const project = await prisma.proyecto.findUnique({
    where: { id: projectId },
    select: { id_usuario: true },
  });
  if (!project) throw new NotFoundError('Project not found');

  const isOwner = project.id_usuario === requestingUser.dbUser.id;
  const isAdmin = requestingUser.dbUser.rol.nombre === 'admin';
  if (!isOwner && !isAdmin) throw new ForbiddenError('Not authorized to see these visits');

  return getVisitStats({ projectId, days });
};

module.exports = { locate, recordVisit, parseDays, getVisitStats, getProjectVisitStats };
