const router = require('express').Router();
const { register, sync, forgotPassword } = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register user in DB after Firebase signup
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, correo]
 *             properties:
 *               nombre: { type: string }
 *               correo: { type: string, format: email }
 *     responses:
 *       201: { description: User registered }
 *       409: { description: Already registered }
 */
router.post('/register', verifyToken, register);

/**
 * @swagger
 * /auth/sync:
 *   post:
 *     summary: Sync user on login (email/pass or Google)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, correo]
 *             properties:
 *               nombre: { type: string }
 *               correo: { type: string }
 *     responses:
 *       200: { description: User synced }
 */
router.post('/sync', verifyToken, sync);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Send password reset email via Resend
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [correo]
 *             properties:
 *               correo: { type: string, format: email }
 *     responses:
 *       200: { description: Reset email sent (always 200) }
 */
router.post('/forgot-password', forgotPassword)

module.exports = router;