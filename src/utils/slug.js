const { nanoid } = require('nanoid');

const SLUG_MIN = 3;
const SLUG_MAX = 60;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turn any text into the URL-friendly form of a slug: lowercase, no accents,
 * words joined by single hyphens. Example: "Memoria Visual" → "memoria-visual"
 * @param {string} text
 * @returns {string}
 */
const slugify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Generate a URL-friendly slug from a project name.
 * Example: "Memoria Visual" → "memoria-visual-x7k2"
 * @param {string} name
 * @returns {string}
 */
const generateSlug = (name) => {
  const base = slugify(name).substring(0, 40).replace(/-$/, '') || 'juego';
  const suffix = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  return `${base}-${suffix}`;
};

/** Whether a slug chosen by a user has a valid shape. */
const isValidSlug = (slug) =>
  typeof slug === 'string'
  && slug.length >= SLUG_MIN
  && slug.length <= SLUG_MAX
  && SLUG_PATTERN.test(slug);

module.exports = { generateSlug, slugify, isValidSlug, SLUG_MIN, SLUG_MAX };