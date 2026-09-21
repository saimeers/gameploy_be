const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const c = require('../controllers/admin.controller');
const commentController = require('../controllers/comment.controller');
const { verifyToken, requireRegisteredUser } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const prisma = new PrismaClient()

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

// ── Categorias
/**
 * @swagger
 * /admin/categorias:
 *   get:
 *     summary: List all categories
 *     tags: [Admin]
 *   post:
 *     summary: Create category
 *     tags: [Admin]
 */
router.get('/categorias', async (req, res, next) => {
  try {
    const cats = await prisma.categoria.findMany({ orderBy: { nombre: 'asc' } })
    res.json({ success: true, data: cats })
  } catch (err) { next(err) }
})

router.post('/categorias', async (req, res, next) => {
  try {
    const cat = await prisma.categoria.create({ data: req.body })
    res.status(201).json({ success: true, data: cat })
  } catch (err) { next(err) }
})

router.patch('/categorias/:id', async (req, res, next) => {
  try {
    const cat = await prisma.categoria.update({
      where: { id: Number(req.params.id) }, data: req.body,
    })
    res.json({ success: true, data: cat })
  } catch (err) { next(err) }
})

router.delete('/categorias/:id', async (req, res, next) => {
  try {
    await prisma.categoria.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'Deleted' })
  } catch (err) { next(err) }
})

// ── Etiquetas
router.get('/etiquetas', async (req, res, next) => {
  try {
    const tags = await prisma.etiqueta.findMany({ orderBy: { nombre: 'asc' } })
    res.json({ success: true, data: tags })
  } catch (err) { next(err) }
})

router.post('/etiquetas', async (req, res, next) => {
  try {
    const tag = await prisma.etiqueta.create({ data: req.body })
    res.status(201).json({ success: true, data: tag })
  } catch (err) { next(err) }
})

router.patch('/etiquetas/:id', async (req, res, next) => {
  try {
    const tag = await prisma.etiqueta.update({
      where: { id: Number(req.params.id) }, data: req.body,
    })
    res.json({ success: true, data: tag })
  } catch (err) { next(err) }
})

router.delete('/etiquetas/:id', async (req, res, next) => {
  try {
    await prisma.etiqueta.delete({ where: { id: Number(req.params.id) } })
    res.json({ success: true, message: 'Deleted' })
  } catch (err) { next(err) }
})

module.exports = router;