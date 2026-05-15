const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const projectRoutes = require('./project.routes');
const versionRoutes = require('./version.routes');
const commentRoutes = require('./comment.routes');
const searchRoutes = require('./search.routes');
const adminRoutes = require('./admin.routes');
const controlRoutes = require('./control.routes')

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/projects/:projectId/versions', versionRoutes);
router.use('/projects/:projectId/comments', commentRoutes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);
router.use('/projects/:projectId/controls', controlRoutes)
router.get('/public/games/:slug', async (req, res, next) => {
  try {
    const project = await prisma.proyecto.findUnique({
      where: { slug: req.params.slug },
      include: {
        usuario:    { select: { nombre: true } },
        categoria:  true,
        etiquetas:  { include: { etiqueta: true } },
        controles:  { orderBy: { orden: 'asc' } },
        comentarios: {
          where: { activo: true },
          include: { usuario: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
          take: 20,
        },
        versiones: {
          where:   { es_activa: true },
          include: { archivos: true },
          take: 1,
        },
      },
    })

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' })
    if (project.estado !== 'publicado') {
      return res.status(403).json({ success: false, message: 'Project not published' })
    }
    const origen = req.headers.referer || req.headers.origin || null
    await prisma.visita.create({
      data: { id_proyecto: project.id, origen },
    }).catch(() => {})

    res.json({ success: true, data: project })
  } catch (err) { next(err) }
})

router.get('/public/files/url', async (req, res, next) => {
  try {
    const { key } = req.query
    if (!key) return res.status(400).json({ success: false, message: 'key required' })
    const { getPresignedUrl } = require('./services/storage.service')
    const url = await getPresignedUrl(key, 3600)
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
})

module.exports = router;