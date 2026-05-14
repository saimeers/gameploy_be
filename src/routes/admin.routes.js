const router = require('express').Router();
const c = require('../controllers/admin.controller');
const commentController = require('../controllers/comment.controller');
const { verifyToken, requireRegisteredUser } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

// All admin routes require admin role
router.use(verifyToken, requireRegisteredUser, requireRoles('admin'));

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get platform usage stats
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Stats object }
 */
router.get('/stats', c.getStats);

/**
 * @swagger
 * /admin/projects:
 *   get:
 *     summary: List all projects (admin view)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: All projects }
 */
router.get('/projects', c.getAllProjects);

/**
 * @swagger
 * /admin/projects/{id}/featured:
 *   patch:
 *     summary: Toggle featured status of a project
 *     tags: [Admin]
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
 *               destacado: { type: boolean }
 *     responses:
 *       200: { description: Featured updated }
 */
router.patch('/projects/:id/featured', c.toggleFeatured);

/**
 * @swagger
 * /admin/projects/{id}:
 *   delete:
 *     summary: Delete any project (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project deleted }
 */
router.delete('/projects/:id', c.deleteProject);

/**
 * @swagger
 * /admin/comments/{id}/moderate:
 *   patch:
 *     summary: Moderate a comment
 *     tags: [Admin]
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
router.patch('/comments/:id/moderate', commentController.moderate);

/**
 * @swagger
 * /admin/users/{id}/approve:
 *   patch:
 *     summary: Approve a pending user and assign their requested role
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User approved }
 *       409: { description: User is not pending }
 */
router.patch('/users/:id/approve', c.approveUser);

module.exports = router;