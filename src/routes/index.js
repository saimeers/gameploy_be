const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const fs = require('fs')
const path = require('path')
const play = require('../services/play.service')
const { withFileUrls } = require('../services/fileUrls')
const { getPublicFilesConfig } = require('../config/publicFiles')
const cdnToken = require('../utils/cdnToken')
const visitService = require('../services/visit.service')
const projectService = require('../services/project.service')
const cache = require('../services/cache.service')
const { clientIp } = require('../utils/clientIp')

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const projectRoutes = require('./project.routes');
const versionRoutes = require('./version.routes');
const commentRoutes = require('./comment.routes');
const searchRoutes = require('./search.routes');
const adminRoutes = require('./admin.routes');
const controlRoutes = require('./control.routes');
const surveyRoutes = require('./survey.routes');
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
router.use('/encuesta', surveyRoutes)

router.get('/public/games/:slug', async (req, res, next) => {
  try {
    // Cached for a minute (invalidated when a project changes); the
    // visibility checks below run on every request. Old slugs still resolve:
    // the frontend redirects to the current one.
    const project = await cache.remember('games', `slug:${req.params.slug}`, 60, async () => {
      const projectId = await projectService.resolveSlug(req.params.slug)
      return projectId && prisma.proyecto.findUnique({
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
      // Only its owner (or an admin) may open a private project
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
        const dbUser = await prisma.usuario.findUnique({
          where: { firebase_uid: decoded.uid },
          include: { rol: true },
        })
        if (!dbUser || (dbUser.id !== project.id_usuario && dbUser.rol?.nombre !== 'admin')) {
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
      ip: clientIp(req),
      origen: req.headers.referer || req.headers.origin || null,
      headers: req.headers,
    })

    res.json({ success: true, data: await withFileUrls(project) })
  } catch (err) { next(err) }
})

// Development CDN: with no R2 configured, published files live in a local
// folder and are served here with the same signed links the CDN Worker checks.
router.get(/^\/cdn(\/t\/.+)$/, async (req, res) => {
    const cfg = getPublicFilesConfig()
    if (cfg.driver !== 'local') return res.status(404).send('Not found')

    const target = cdnToken.parsePath(req.params[0])
    if (!target) return res.status(404).send('Not found')
    if (!cdnToken.verify(cfg.signingSecret, target)) return res.status(403).send('Forbidden')

    const file = path.join(cfg.localDir, target.key)
    if (!file.startsWith(path.resolve(cfg.localDir) + path.sep) || !fs.existsSync(file)) {
        return res.status(404).send('Not found')
    }
    res.setHeader('Content-Type', play.contentTypeFor(file))
    res.setHeader('Cache-Control', target.key.endsWith('/index.html') ? 'public, max-age=300' : 'public, max-age=31536000, immutable')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.sendFile(file)
})

// Legacy: games uploaded before publishing existed, served from the zip in
// the bucket. Same rules as the public game page: only the active version of
// a published project that is not private. New builds are served by the CDN.
router.get(/^\/play\/([^/]+)\/([^/]+)\/(.+)$/, async (req, res, next) => {
    try {
        const projectId = req.params[0]
        const versionId = req.params[1]
        const filename = req.params[2]

        const archivo = await prisma.archivo.findFirst({
            where: {
                id_version: versionId,
                tipo: 'juego_webgl',
                version: {
                    id_proyecto: projectId,
                    es_activa: true,
                    proyecto: { estado: 'publicado', visibilidad: { not: 'privado' } },
                },
            },
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

    res.json({ success: true, data: await withFileUrls(evaluations) })
  } catch (err) { next(err) }
})

module.exports = router;