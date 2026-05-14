const router = require('express').Router({ mergeParams: true });
const multer = require('multer');
const c = require('../controllers/version.controller');
const { verifyToken, requireRegisteredUser } = require('../middlewares/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

/**
 * @swagger
 * /projects/{projectId}/versions:
 *   get:
 *     summary: List all versions of a project
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Version list }
 *   post:
 *     summary: Create a new version
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numero_version]
 *             properties:
 *               numero_version: { type: string, example: "1.0" }
 *               notas_version: { type: string }
 *     responses:
 *       201: { description: Version created }
 */
router.get('/', verifyToken, requireRegisteredUser,c.list);
router.post('/', verifyToken, requireRegisteredUser,c.create);

/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/files:
 *   post:
 *     summary: Upload a file to a version
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               fileType:
 *                 type: string
 *                 enum: [juego_webgl, portada, captura]
 *     responses:
 *       201: { description: File uploaded }
 */
router.post('/:versionId/files', verifyToken, requireRegisteredUser, upload.single('file'), c.uploadFile);

/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/activate:
 *   patch:
 *     summary: Set a version as active
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Active version set }
 */
router.patch('/:versionId/activate', verifyToken, requireRegisteredUser, c.setActive);

module.exports = router;