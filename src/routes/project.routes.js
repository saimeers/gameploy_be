const router = require('express').Router();
const c = require('../controllers/project.controller');
const { verifyToken, requireRegisteredUser, optionalToken } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre]
 *             properties:
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               instrucciones: { type: string }
 *               id_categoria: { type: integer }
 *               etiquetas: { type: array, items: { type: integer } }
 *     responses:
 *       201: { description: Project created }
 */
router.post('/', verifyToken, requireRegisteredUser, requireRoles('estudiante', 'admin'), c.create);

/**
 * @swagger
 * /projects/mine:
 *   get:
 *     summary: Get current user's projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Project list }
 */
router.get('/mine', verifyToken, requireRegisteredUser, c.getMine);

/**
 * @swagger
 * /projects/{slug}:
 *   get:
 *     summary: Get a project by its slug (public)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project data }
 *       403: { description: Private project }
 *       404: { description: Not found }
 */
router.get('/:slug', optionalToken, c.getBySlug);

/**
 * @swagger
 * /projects/{id}:
 *   patch:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated project }
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Deleted }
 */
router.patch('/:id', verifyToken, requireRegisteredUser, c.update);
router.delete('/:id', verifyToken, requireRegisteredUser, c.remove);

/**
 * @swagger
 * /projects/{id}/publish:
 *   patch:
 *     summary: Publish a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project published }
 */
router.patch('/:id/publish', verifyToken, requireRegisteredUser, c.publish);

module.exports = router;