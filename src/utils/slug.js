const { nanoid } = require('nanoid');

/**
 * Generate a URL-friendly slug from a project name.
 * Example: "Memoria Visual" → "memoria-visual-x7k2"
 * @param {string} name
 * @returns {string}
 */
const generateSlug = (name) => {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') 
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 40);

  const suffix = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  return `${base}-${suffix}`;
};

module.exports = { generateSlug };