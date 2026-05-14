const router = require('express').Router();
const c = require('../controllers/user.controller');
const { verifyToken, requireRegisteredUser } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User profile }
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *     responses:
 *       200: { description: Updated profile }
 */
router.get('/me', verifyToken, requireRegisteredUser, c.getMe);
router.patch('/me', verifyToken, requireRegisteredUser, c.updateMe);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
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
 *       200: { description: User list }
 */
router.get('/', verifyToken, requireRegisteredUser, requireRoles('admin'), c.getAll);

/**
 * @swagger
 * /users/{id}/role:
 *   patch:
 *     summary: Update user role (admin only)
 *     tags: [Users]
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
 *               rol: { type: string, enum: [admin, estudiante, docente] }
 *     responses:
 *       200: { description: Role updated }
 */
router.patch('/:id/role', verifyToken, requireRegisteredUser, requireRoles('admin'), c.updateRole);

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     summary: Activate or deactivate user (admin only)
 *     tags: [Users]
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
 *       200: { description: Status updated }
 */
router.patch('/:id/status', verifyToken, requireRegisteredUser, requireRoles('admin'), c.toggleStatus);

/**
 * @swagger
 * /users/check:
 *   get:
 *     summary: Verifica si un usuario existe por su email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *       name: email
 *       required: true
 *       schema: { type: string }
 *     responses:
 *       200: { description: Retorna true o false si existe }
 */
router.get('/check', verifyToken, c.checkUser);

module.exports = router;