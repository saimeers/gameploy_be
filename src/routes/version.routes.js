const router = require('express').Router({ mergeParams: true });
const multer = require('multer');
const c = require('../controllers/version.controller');
const { verifyToken, requireRegisteredUser } = require('../middlewares/auth.middleware');
const { AppError } = require('../utils/errors');
const { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, FORM_OVERHEAD_BYTES } = require('../config/uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  // Browsers send file names as UTF-8: "Portada Ñandú.png" must not arrive as latin1.
  defParamCharset: 'utf8',
});

const tooLarge = () => new AppError(`File too large: the maximum is ${MAX_UPLOAD_MB} MB`, 413);

/** Reject an oversized upload from its Content-Length, before reading the body. */
const limitUploadSize = (req, _res, next) => {
  const length = Number(req.headers['content-length']);
  if (length > MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES) return next(tooLarge());
  next();
};

/** multer.single, answering 413 instead of a 500 when the file is too large. */
const uploadSingle = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(tooLarge());
    next(err);
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
 *     description: >
 *       Carries over the files of the currently active version. Send `heredar`
 *       with the ids of the files to keep; omit it to keep them all, or send an
 *       empty array to start the version without files. Inherited files reuse
 *       the same object in the bucket, so nothing is uploaded twice.
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
 *               heredar:
 *                 type: array
 *                 items: { type: string }
 *                 description: Ids of the active version's files to keep
 *     responses:
 *       201: { description: Version created, with its inherited files }
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
 *     description: >
 *       Maximum 95 MB per file. The API is behind Cloudflare, which rejects
 *       requests over 100 MB.
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
 *       413: { description: The file is larger than 95 MB }
 */
router.post('/:versionId/files', verifyToken, requireRegisteredUser, limitUploadSize, uploadSingle('file'), c.uploadFile);

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

/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/files/{fileId}:
 *   delete:
 *     summary: Permanently delete a file
 *     tags: [Versions]
 *   patch:
 *     summary: Toggle file active status
 *     tags: [Versions]
 */
/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/files/{fileId}:
 *   delete:
 *     summary: Delete a file of a version (owner only)
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
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: File deleted }
 *       403: { description: Not the owner of the project }
 *       404: { description: File not found }
 */
router.delete('/:versionId/files/:fileId', verifyToken, requireRegisteredUser, c.removeFile)

/**
 * @swagger
 * /projects/{projectId}/versions/{versionId}/files/{fileId}/download:
 *   get:
 *     summary: Link to download the original upload of a file
 *     description: Owner only. The link is valid for 5 minutes.
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
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ url }" }
 *       403: { description: Not the owner }
 */
router.get('/:versionId/files/:fileId/download', verifyToken, requireRegisteredUser, c.download)

module.exports = router;