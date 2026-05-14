const router = require('express').Router({ mergeParams: true });
const c = require('../controllers/comment.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

/**
 * @swagger
 * /projects/{projectId}/comments:
 *   get:
 *     summary: Get comments for a project
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Comment list }
 *   post:
 *     summary: Add a comment (docente/admin only)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contenido]
 *             properties:
 *               contenido: { type: string }
 *               calificacion: { type: integer, minimum: 1, maximum: 5 }
 *     responses:
 *       201: { description: Comment added }
 */
router.get('/', c.list);
router.post('/', verifyToken, requireRoles('docente', 'admin'), c.add);

/**
 * @swagger
 * /comments/{id}/moderate:
 *   patch:
 *     summary: Moderate a comment (admin only)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Comment moderated }
 */
module.exports = router;