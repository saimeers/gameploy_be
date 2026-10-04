const router = require('express').Router();
const c = require('../controllers/survey.controller');
const { verifyToken, requireRegisteredUser, optionalToken } = require('../middlewares/auth.middleware');
const { createLimiter } = require('../middlewares/rateLimit.middleware');

// Visitors without an account can answer too. A classroom shares one IP, so
// the limit only stops floods, not a group answering together.
const answerLimiter = createLimiter('rl:encuesta:', {
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: 'Too many answers from this connection, please try again later.',
});

/**
 * @swagger
 * /encuesta/estado:
 *   get:
 *     summary: Whether to invite the current user to the usability survey
 *     description: >
 *       With a session, the server decides (published first project or first
 *       evaluation, or 7+ days and 3+ active days; "Ahora no" postpones 3 days,
 *       at most twice) and counts the day as active. Without a session the
 *       answer is neutral and the browser decides.
 *     tags: [Survey]
 *     responses:
 *       200: { description: "{ puede_responder, respondida, invitar, momento, pospuesta }" }
 */
router.get('/estado', optionalToken, c.status);

/**
 * @swagger
 * /encuesta:
 *   post:
 *     summary: Send an anonymous answer to the usability survey
 *     description: >
 *       No user, email or IP is stored with the answer. With a session, the
 *       account is marked as answered (409 the second time). Administrators
 *       cannot answer.
 *     tags: [Survey]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [version, momento, sus, ux]
 *             properties:
 *               version: { type: integer, example: 1 }
 *               momento: { type: string, enum: [primer_proyecto, uso_prolongado, tras_jugar, voluntaria] }
 *               sus: { type: array, items: { type: integer, minimum: 1, maximum: 5 }, minItems: 10, maxItems: 10 }
 *               ux: { type: array, items: { type: integer, minimum: 1, maximum: 5 }, minItems: 10, maxItems: 10 }
 *               edad: { type: string }
 *               genero: { type: string }
 *               experiencia_videojuegos: { type: string }
 *               frecuencia_juego: { type: string }
 *               juegos_serios_previos: { type: string }
 *               comentario: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Answer saved }
 *       403: { description: Administrators do not answer }
 *       409: { description: This account already answered }
 *       422: { description: Invalid answer }
 */
router.post('/', answerLimiter, optionalToken, c.submit);

/**
 * @swagger
 * /encuesta/posponer:
 *   post:
 *     summary: "\"Ahora no\": hide the invitation for 3 days (at most twice)"
 *     tags: [Survey]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Postponed }
 */
router.post('/posponer', verifyToken, requireRegisteredUser, c.postpone);

module.exports = router;
