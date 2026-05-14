const router = require('express').Router();
const c = require('../controllers/search.controller');

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Search public projects
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search term (name or description)
 *       - in: query
 *         name: categoria
 *         schema: { type: integer }
 *       - in: query
 *         name: etiquetas
 *         schema: { type: string }
 *         description: Comma-separated tag IDs, e.g. "1,3,5"
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Search results }
 */
router.get('/', c.search);

/**
 * @swagger
 * /search/categorias:
 *   get:
 *     summary: List all categories
 *     tags: [Search]
 *     responses:
 *       200: { description: Category list }
 */
router.get('/categorias', c.getCategorias);

/**
 * @swagger
 * /search/etiquetas:
 *   get:
 *     summary: List all tags
 *     tags: [Search]
 *     responses:
 *       200: { description: Tag list }
 */
router.get('/etiquetas', c.getEtiquetas);

module.exports = router;