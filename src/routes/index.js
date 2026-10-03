const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const { getPresignedUrl } = require('../services/storage.service')
const play = require('../services/play.service')
const visitService = require('../services/visit.service')
const projectService = require('../services/project.service')

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const projectRoutes = require('./project.routes');
const versionRoutes = require('./version.routes');
const commentRoutes = require('./comment.routes');
const searchRoutes = require('./search.routes');
const adminRoutes = require('./admin.routes');
const controlRoutes = require('./control.routes');
const { verifyToken } = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

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
    // Old slugs still resolve: the frontend redirects to the current one
    const projectId = await projectService.resolveSlug(req.params.slug)
    const project = projectId && await prisma.proyecto.findUnique({
      where: { id: projectId },
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
          where: { es_activa: true },
          include: { archivos: true },
          take: 1,
        },
        _count: { select: { visitas: true } },
      },
    })

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    if (project.estado !== 'publicado') {
      return res.status(403).json({
        success: false,
        message: 'Project not published',
        reason: 'not_published',
      })
    }

    if (project.visibilidad === 'privado') {
      // Check if request has a valid token for the owner
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(403).json({
          success: false,
          message: 'This project is private',
          reason: 'private',
        })
      }
      try {
        const admin = require('../config/firebase')
        const decoded = await admin.auth().verifyIdToken(authHeader.split(' ')[1])
        const dbUser = await prisma.usuario.findUnique({ where: { firebase_uid: decoded.uid } })
        if (!dbUser || dbUser.id !== project.id_usuario) {
          return res.status(403).json({
            success: false,
            message: 'This project is private',
            reason: 'private',
          })
        }
      } catch {
        return res.status(403).json({
          success: false,
          message: 'This project is private',
          reason: 'private',
        })
      }
    }

    // Not awaited: locating and storing the visit must not delay the page
    visitService.recordVisit(project.id, {
      ip: req.ip,
      origen: req.headers.referer || req.headers.origin || null,
    })

    res.json({ success: true, data: project })
  } catch (err) { next(err) }
})

router.get('/public/files/url', async (req, res, next) => {
    try {
        const { key } = req.query
        if (!key) return res.status(400).json({ success: false, message: 'key required' })
        const url = await getPresignedUrl(key, 3600)
        res.json({ success: true, data: { url } })
    } catch (err) { next(err) }
})

// Serve WebGL game files from the zip in the bucket
router.get(/^\/play\/([^/]+)\/([^/]+)\/(.+)$/, async (req, res, next) => {
    try {
        const projectId = req.params[0]
        const versionId = req.params[1]
        const filename = req.params[2]

        const archivo = await prisma.archivo.findFirst({
            where: { id_version: versionId, tipo: 'juego_webgl', version: { id_proyecto: projectId } },
            select: { id: true, ruta_storage: true, fecha_subida: true },
        })

        if (!archivo) {
            return res.status(404).send('Game not found')
        }

        // Unity WebGL runs in an iframe of the frontend's origin
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

        // Each upload creates a new Archivo row, so its id identifies the
        // content of every file in the build: browsers keep their copy and
        // only revalidate, which answers 304 without touching the zip.
        const etag = `"${archivo.id}-${play.SERVE_REVISION}"`
        res.setHeader('ETag', etag)
        res.setHeader('Cache-Control', 'public, no-cache')
        res.setHeader('Last-Modified', new Date(archivo.fecha_subida).toUTCString())
        const cached = (req.headers['if-none-match'] ?? '').split(',').map(t => t.trim())
        if (cached.includes(etag)) {
            return res.status(304).end()
        }

        const build = await play.loadBuild(archivo.ruta_storage)
        const file = play.findFile(build, filename)

        if (!file) {
            return res.status(404).send(`File not found in zip: ${filename}`)
        }

        res.setHeader('Content-Type', play.contentTypeFor(file.name))

        if (play.isEntryPage(build, file.name)) {
            return res.send(play.injectProgressReporter(file.data.toString('utf8')))
        }

        res.send(file.data)

    } catch (err) {
        next(err)
    }
})

router.get('/teacher/evaluations', verifyToken, requireRoles('docente', 'admin'), async (req, res, next) => {
  try {
    const userId = req.user.dbUser.id
    // Get distinct projects where this user has commented
    const comentarios = await prisma.comentario.findMany({
      where: { id_usuario: userId, activo: true },
      include: {
        proyecto: {
          include: {
            usuario:  { select: { nombre: true } },
            categoria: true,
            versiones: {
              where:   { es_activa: true },
              include: { archivos: { where: { tipo: 'portada' }, take: 1 } },
              take: 1,
            },
            _count: { select: { visitas: true, comentarios: true } },
          },
        },
      },
      orderBy: { fecha: 'desc' },
    })

    // Deduplicate by project
    const seen = new Set()
    const evaluations = comentarios
      .filter(c => { if (seen.has(c.id_proyecto)) return false; seen.add(c.id_proyecto); return true })
      .map(c => ({ ...c.proyecto, mi_comentario: c }))

    res.json({ success: true, data: evaluations })
  } catch (err) { next(err) }
})

module.exports = router;