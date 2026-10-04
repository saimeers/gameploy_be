const { PrismaClient } = require('@prisma/client');
const { ConflictError, ForbiddenError, ValidationError } = require('../utils/errors');
const cfg = require('../config/encuesta');

const prisma = new PrismaClient();

/**
 * The usability (SUS) and experience questionnaire about the platform.
 *
 * Answers are anonymous: a RespuestaEncuesta row has no user, email or IP,
 * and only the day it was sent. For users with an account, the only trace is
 * Usuario.encuesta_respondida, so they are asked once. Visitors without an
 * account are limited per browser (frontend) and per IP (rate limit).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Scoring ───────────────────────────────────────────────────────────────────

const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** SUS contribution of one answer, 0–4: odd items x − 1, even items 5 − x. */
const susContribution = (answer, index) => (index % 2 === 0 ? answer - 1 : 5 - answer);

/** Experience answer with negative items reversed, so 5 is always the best. */
const uxFavorable = (answer, index) => (cfg.UX_REVERSED.includes(index + 1) ? 6 - answer : answer);

/** Standard SUS score, 0–100. */
const scoreSus = (sus) => sus.reduce((sum, answer, i) => sum + susContribution(answer, i), 0) * 2.5;

/** Experience index, 0–100: mean favorable agreement mapped from 1–5. */
const scoreUx = (ux) => round((mean(ux.map(uxFavorable)) - 1) * 25);

const bandFor = (score) =>
  cfg.SUS_BANDS.find(b => score < b.to) ?? cfg.SUS_BANDS[cfg.SUS_BANDS.length - 1];

// ── Invitation ────────────────────────────────────────────────────────────────

const profileOf = (dbUser) => {
  const role = dbUser?.rol?.nombre;
  return role === 'estudiante' || role === 'docente' ? role : 'visitante';
};

const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Count a day of activity the first time the user opens the platform that day. */
const touchActivity = async (dbUser) => {
  const day = today();
  if (dbUser.ultimo_dia_activo && dbUser.ultimo_dia_activo.getTime() === day.getTime()) return dbUser;
  return prisma.usuario.update({
    where: { id: dbUser.id },
    data: { ultimo_dia_activo: day, dias_activos: { increment: 1 } },
  });
};

/** Which invitation applies to this user now, or null. */
const triggerFor = async (dbUser) => {
  const role = dbUser.rol?.nombre;
  if (role === 'estudiante') {
    const published = await prisma.proyecto.count({ where: { id_usuario: dbUser.id, estado: 'publicado' } });
    if (published > 0) return 'primer_proyecto';
  }
  if (role === 'docente') {
    const comments = await prisma.comentario.count({ where: { id_usuario: dbUser.id } });
    if (comments > 0) return 'primer_proyecto';
  }
  const daysRegistered = (Date.now() - new Date(dbUser.fecha_registro).getTime()) / DAY_MS;
  if (daysRegistered >= cfg.INVITE.minDaysRegistered && dbUser.dias_activos >= cfg.INVITE.minActiveDays) {
    return 'uso_prolongado';
  }
  return null;
};

/**
 * Whether to invite this user to the survey, and why. Visitors without an
 * account get a neutral answer: their browser decides.
 * @param {object | null} dbUser
 */
const getStatus = async (dbUser) => {
  if (!dbUser) return { puede_responder: true, respondida: false, invitar: false, momento: null, pospuesta: false };
  if (dbUser.rol?.nombre === 'admin' || dbUser.rol?.nombre === 'pendiente') {
    return { puede_responder: false, respondida: false, invitar: false, momento: null, pospuesta: false };
  }

  const user = await touchActivity(dbUser);
  if (user.encuesta_respondida) {
    return { puede_responder: false, respondida: true, invitar: false, momento: null, pospuesta: false };
  }

  const pospuesta = user.encuesta_pospuestas >= cfg.INVITE.maxPostpones
    || (user.encuesta_pospuesta_hasta && user.encuesta_pospuesta_hasta > new Date());
  const momento = pospuesta ? null : await triggerFor({ ...dbUser, ...user });
  return { puede_responder: true, respondida: false, invitar: Boolean(momento), momento, pospuesta: Boolean(pospuesta) };
};

/** "Ahora no": hide the invitation for a few days, up to a limit. */
const postpone = async (dbUser) => {
  if (dbUser.encuesta_respondida) return;
  await prisma.usuario.update({
    where: { id: dbUser.id },
    data: {
      encuesta_pospuestas: { increment: 1 },
      encuesta_pospuesta_hasta: new Date(Date.now() + cfg.INVITE.postponeDays * DAY_MS),
    },
  });
};

// ── Answers ───────────────────────────────────────────────────────────────────

const validAnswers = (list) =>
  Array.isArray(list)
  && list.length === cfg.ITEMS
  && list.every(x => Number.isInteger(x) && x >= cfg.SCALE.min && x <= cfg.SCALE.max);

/** Check an answer and keep only the known fields. */
const parseAnswer = (body = {}) => {
  if (body.version !== cfg.VERSION) throw new ValidationError(`Unknown questionnaire version (expected ${cfg.VERSION})`);
  if (!cfg.MOMENTS.includes(body.momento)) throw new ValidationError('Invalid momento');
  if (!validAnswers(body.sus)) throw new ValidationError(`sus must be ${cfg.ITEMS} answers from 1 to 5`);
  if (!validAnswers(body.ux)) throw new ValidationError(`ux must be ${cfg.ITEMS} answers from 1 to 5`);

  const demographics = {};
  for (const [field, allowed] of Object.entries(cfg.DEMOGRAPHICS)) {
    const value = body[field];
    if (value == null || value === '') continue;
    if (!allowed.includes(value)) throw new ValidationError(`Invalid ${field}`);
    demographics[field] = value;
  }

  const comentario = typeof body.comentario === 'string' ? body.comentario.trim() : '';
  if (comentario.length > cfg.COMMENT_MAX) throw new ValidationError(`comentario is longer than ${cfg.COMMENT_MAX} characters`);

  return { momento: body.momento, sus: body.sus, ux: body.ux, comentario: comentario || null, ...demographics };
};

/**
 * Save an anonymous answer. A user with an account answers once; marking it
 * and saving the answer happen together.
 * @param {object} body
 * @param {object | null} dbUser
 */
const submit = async (body, dbUser) => {
  const role = dbUser?.rol?.nombre;
  if (role === 'admin') throw new ForbiddenError('Administrators review the survey; they do not answer it');

  const answer = parseAnswer(body);
  const data = {
    ...answer,
    version: cfg.VERSION,
    perfil: profileOf(dbUser),
    sus_puntaje: scoreSus(answer.sus),
    ux_puntaje: scoreUx(answer.ux),
  };

  if (!dbUser) {
    await prisma.respuestaEncuesta.create({ data, select: { id: true } });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const marked = await tx.usuario.updateMany({
      where: { id: dbUser.id, encuesta_respondida: false },
      data: { encuesta_respondida: true },
    });
    if (marked.count === 0) throw new ConflictError('You already answered the survey');
    await tx.respuestaEncuesta.create({ data, select: { id: true } });
  });
};

// ── Results ───────────────────────────────────────────────────────────────────

/** Two-sided 95 % Student t critical values by degrees of freedom. */
const T95 = [
  [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306],
  [9, 2.262], [10, 2.228], [12, 2.179], [15, 2.131], [20, 2.086], [25, 2.06], [30, 2.042],
  [40, 2.021], [60, 2.0], [120, 1.98],
];
const tCritical = (df) => (T95.find(([d]) => df <= d) ?? [0, 1.96])[1];

/** Mean, standard deviation and 95 % confidence interval of a list of scores. */
const describe = (values) => {
  const n = values.length;
  if (n === 0) return { n: 0, media: null, desviacion: null, ic95: null };
  const m = mean(values);
  if (n === 1) return { n, media: round(m), desviacion: null, ic95: null };
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  const margin = tCritical(n - 1) * sd / Math.sqrt(n);
  return {
    n,
    media: round(m),
    desviacion: round(sd),
    ic95: [round(Math.max(0, m - margin)), round(Math.min(100, m + margin))],
  };
};

const countBy = (rows, field) => {
  const counts = {};
  for (const row of rows) {
    const key = row[field] ?? 'sin_respuesta';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

/** Each answer as a favorable percentage: 100 is the best answer to that item. */
const susPercent = (answer, i) => susContribution(answer, i) * 25;
const uxPercent = (answer, i) => (uxFavorable(answer, i) - 1) * 25;

/**
 * Each item: how many chose each answer (1–5, raw), whether it is negative
 * (agreeing is bad), its mean agreement and its favorable score (0–100).
 */
const itemMeans = (rows, field, percent, isNegative) =>
  Array.from({ length: cfg.ITEMS }, (_, i) => {
    const answers = rows.map(r => r[field][i]);
    const respuestas = [1, 2, 3, 4, 5].map(v => answers.filter(a => a === v).length);
    return {
      item: i + 1,
      inversa: isNegative(i),
      respuestas,
      acuerdo: round(mean(answers), 2),
      favorable: round(mean(answers.map(a => percent(a, i)))),
    };
  });

/** SUS scores in ten 10-point bins (the last one includes 100). */
const histogram = (scores) =>
  Array.from({ length: 10 }, (_, b) => ({
    desde: b * 10,
    hasta: b * 10 + 10,
    respuestas: scores.filter(s => (b === 9 ? s >= 90 : s >= b * 10 && s < b * 10 + 10)).length,
  }));

const filtersToWhere = ({ dias, perfil, momento } = {}) => {
  const where = {};
  if (dias) where.fecha = { gte: new Date(today().getTime() - dias * DAY_MS) };
  if (perfil) where.perfil = perfil;
  if (momento) where.momento = momento;
  return where;
};

/** Parse the filters of the results endpoints from a query string. */
const parseFilters = (query = {}) => {
  const dias = Number(query.dias);
  return {
    dias: Number.isInteger(dias) && dias > 0 && dias <= 3650 ? dias : undefined,
    perfil: ['estudiante', 'docente', 'visitante'].includes(query.perfil) ? query.perfil : undefined,
    momento: cfg.MOMENTS.includes(query.momento) ? query.momento : undefined,
  };
};

/**
 * Everything the results page shows, for the answers matching the filters.
 * @param {{ dias?: number, perfil?: string, momento?: string }} filters
 */
const summary = async (filters = {}) => {
  const rows = await prisma.respuestaEncuesta.findMany({
    where: filtersToWhere(filters),
    orderBy: { fecha: 'asc' },
  });

  const sus = describe(rows.map(r => r.sus_puntaje));
  const ux = describe(rows.map(r => r.ux_puntaje));

  const months = new Map();
  for (const r of rows) {
    const key = r.fecha.toISOString().slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(r);
  }

  return {
    version: cfg.VERSION,
    total: rows.length,
    usabilidad: {
      ...sus,
      banda: sus.media == null ? null : bandFor(sus.media).id,
      referencia: cfg.SUS_AVERAGE,
      bandas: cfg.SUS_BANDS.map(b => ({
        ...b,
        respuestas: rows.filter(r => bandFor(r.sus_puntaje).id === b.id).length,
      })),
      histograma: histogram(rows.map(r => r.sus_puntaje)),
      items: rows.length ? itemMeans(rows, 'sus', susPercent, i => i % 2 === 1) : [],
    },
    experiencia: {
      ...ux,
      inversos: cfg.UX_REVERSED,
      items: rows.length ? itemMeans(rows, 'ux', uxPercent, i => cfg.UX_REVERSED.includes(i + 1)) : [],
    },
    tendencia: [...months].map(([mes, list]) => ({
      mes,
      n: list.length,
      usabilidad: round(mean(list.map(r => r.sus_puntaje))),
      experiencia: round(mean(list.map(r => r.ux_puntaje))),
    })),
    participacion: {
      perfil: countBy(rows, 'perfil'),
      momento: countBy(rows, 'momento'),
      ...Object.fromEntries(Object.keys(cfg.DEMOGRAPHICS).map(f => [f, countBy(rows, f)])),
    },
    comentarios: rows
      .filter(r => r.comentario)
      .slice(-20)
      .reverse()
      .map(r => ({ fecha: r.fecha.toISOString().slice(0, 10), perfil: r.perfil, texto: r.comentario })),
  };
};

const csvCell = (value) => {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Every answer matching the filters, one row each, for analysis elsewhere. */
const exportCsv = async (filters = {}) => {
  const rows = await prisma.respuestaEncuesta.findMany({
    where: filtersToWhere(filters),
    orderBy: { fecha: 'asc' },
  });
  const demographics = Object.keys(cfg.DEMOGRAPHICS);
  const header = [
    'fecha', 'version', 'perfil', 'momento', ...demographics,
    ...Array.from({ length: cfg.ITEMS }, (_, i) => `sus${i + 1}`),
    ...Array.from({ length: cfg.ITEMS }, (_, i) => `ux${i + 1}`),
    'sus_puntaje', 'ux_puntaje', 'comentario',
  ];
  const lines = rows.map(r => [
    r.fecha.toISOString().slice(0, 10), r.version, r.perfil, r.momento,
    ...demographics.map(f => r[f]),
    ...r.sus, ...r.ux, r.sus_puntaje, r.ux_puntaje, r.comentario,
  ].map(csvCell).join(','));
  // BOM so Excel opens the accents correctly
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
};

module.exports = {
  scoreSus, scoreUx, bandFor, getStatus, postpone, submit, summary, exportCsv, parseFilters, describe,
};
