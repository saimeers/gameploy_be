const router = require('express').Router();
const c = require('../controllers/admin.controller');
const catalogController = require('../controllers/catalog.controller');
const commentController = require('../controllers/comment.controller');
const surveyController = require('../controllers/survey.controller');
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
 * /admin/stats/visits:
 *   get:
 *     summary: Where the visits to all projects come from
 *     description: Same shape as /projects/mine/visits, across the platform.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Visit stats }
 */
router.get('/stats/visits', c.getVisitStats);

/**
 * @swagger
 * /admin/encuestas/resumen:
 *   get:
 *     summary: Results of the usability (SUS) and experience survey
 *     description: >
 *       Mean, standard deviation and 95 % confidence interval of both scores,
 *       SUS bands, favorable score per item, monthly trend, participation and
 *       the latest comments.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: dias, schema: { type: integer }, description: Only the last N days }
 *       - { in: query, name: perfil, schema: { type: string, enum: [estudiante, docente, visitante] } }
 *       - { in: query, name: momento, schema: { type: string, enum: [primer_proyecto, uso_prolongado, tras_jugar, voluntaria] } }
 *     responses:
 *       200: { description: Survey summary }
 */
router.get('/encuestas/resumen', surveyController.summary);

/**
 * @swagger
 * /admin/encuestas/export.csv:
 *   get:
 *     summary: Every anonymous answer as CSV (same filters as the summary)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: CSV file }
 */
router.get('/encuestas/export.csv', surveyController.exportCsv);

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
 * /admin/projects/{id}:
 *   get:
 *     summary: Get a single project with all its relations (admin read-only view)
 *     description: Ignores visibility and status, so drafts and private projects are readable.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Project with versions, files, controls, tags and comments }
 *       404: { description: Project not found }
 */
router.get('/projects/:id', c.getProject);

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
/**
 * @swagger
 * /admin/files/{id}:
 *   delete:
 *     summary: Permanently delete a project file (admin)
 *     description: Removes the object from the bucket and its row, whoever owns the project.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: File permanently deleted }
 *       404: { description: File not found }
 */
router.delete('/files/:id', c.deleteFile);

/**
 * @swagger
 * /admin/files/{id}/contents:
 *   get:
 *     summary: List the files inside a game build
 *     description: >
 *       Paths are relative to the folder that holds index.html. `compressed`
 *       flags a Gzip/Brotli build, which the player cannot load, and `pwa`
 *       whether it uses Unity's PWA template.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ root, totalBytes, files: [{ path, size }], compressed, pwa }" }
 *       404: { description: File not found }
 *       422: { description: Not a game build }
 */
router.get('/files/:id/contents', c.getBuildContents);

/**
 * @swagger
 * /admin/files/{id}/download:
 *   get:
 *     summary: Link to download the original upload of a file
 *     description: The link is valid for 5 minutes.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "{ url }" }
 *       404: { description: File not found }
 */
router.get('/files/:id/download', c.downloadFile);

/**
 * @swagger
 * /admin/comments/{id}/moderate:
 *   patch:
 *     summary: Hide or show a comment without deleting it
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Comment moderated }
 *       404: { description: Comment not found }
 */
router.patch('/comments/:id/moderate', commentController.moderate);

/**
 * @swagger
 * /admin/comments/{id}:
 *   delete:
 *     summary: Permanently delete a comment (admin)
 *     description: Removes the row. Prefer moderation, which keeps it for auditing.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Comment permanently deleted }
 *       404: { description: Comment not found }
 */
router.delete('/comments/:id', commentController.remove);

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
/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Get the profile of any user (admin)
 *     description: Same payload as /users/me, for the administrator to review an account.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Profile with the user's published projects }
 *       404: { description: User not found }
 */
router.get('/users/:id', c.getUser);

router.patch('/users/:id/approve', c.approveUser);

// ── Categorias y etiquetas
/**
 * @swagger
 * /admin/categorias:
 *   get:
 *     summary: List all categories, active or not, with how many projects use each
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "[{ id, nombre, descripcion, activo, _count: { proyectos } }]" }
 *   post:
 *     summary: Create a category
 *     tags: [Admin]
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
 *     responses:
 *       201: { description: Created }
 *       409: { description: Name already exists }
 * /admin/categorias/{id}:
 *   patch:
 *     summary: Rename or describe a category
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a category that no project uses
 *     description: Responds 409 when projects use it; deactivate it instead.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Deleted }
 *       409: { description: In use by some project }
 * /admin/categorias/{id}/status:
 *   patch:
 *     summary: Activate or deactivate a category
 *     description: >
 *       An inactive category is no longer offered for new projects; the
 *       projects that already use it keep it.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [activo]
 *             properties:
 *               activo: { type: boolean }
 *     responses:
 *       200: { description: Updated category }
 * /admin/etiquetas:
 *   get:
 *     summary: List all tags, active or not, with how many projects use each
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create a tag
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 * /admin/etiquetas/{id}:
 *   patch:
 *     summary: Rename a tag
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a tag that no project uses
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 * /admin/etiquetas/{id}/status:
 *   patch:
 *     summary: Activate or deactivate a tag
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
for (const [path, h] of Object.entries(catalogController)) {
  router.get(`/${path}`, h.list);
  router.post(`/${path}`, h.create);
  router.patch(`/${path}/:id`, h.update);
  router.patch(`/${path}/:id/status`, h.setStatus);
  router.delete(`/${path}/:id`, h.remove);
}

module.exports = router;