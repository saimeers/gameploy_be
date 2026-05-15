const router = require('express').Router();
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const { getPresignedUrl } = require('../services/storage.service')
const AdmZip = require('adm-zip')
const path = require('path')
const https = require('https')
const http = require('http')

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
                usuario: { select: { nombre: true } },
                categoria: true,
                etiquetas: { include: { etiqueta: true } },
                controles: { orderBy: { orden: 'asc' } },
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
            },
        })

        if (!project) return res.status(404).json({ success: false, message: 'Project not found' })
        if (project.estado !== 'publicado') {
            return res.status(403).json({ success: false, message: 'Project not published' })
        }
        const origen = req.headers.referer || req.headers.origin || null
        await prisma.visita.create({
            data: { id_proyecto: project.id, origen },
        }).catch(() => { })

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

// Serve WebGL game files from zip in bucket
router.get('/play/:projectId/:versionId/*', async (req, res, next) => {
    try {

        const { projectId, versionId } = req.params
        const filename = req.params[0]

        const archivo = await prisma.archivo.findFirst({
            where: {
                id_version: versionId,
                tipo: 'juego_webgl'
            }
        })

        if (!archivo) {
            return res.status(404).send('Game not found')
        }

        const zipUrl = await getPresignedUrl(archivo.ruta_storage, 300)

        const zipBuffer = await new Promise((resolve, reject) => {
            const protocol = zipUrl.startsWith('https') ? https : http
            const chunks = []

            protocol.get(zipUrl, resp => {
                resp.on('data', chunk => chunks.push(chunk))
                resp.on('end', () => resolve(Buffer.concat(chunks)))
                resp.on('error', reject)
            }).on('error', reject)
        })

        const zip = new AdmZip(zipBuffer)

        // Detect root folder automatically
        const entries = zip.getEntries()

        const indexEntry = entries.find(e =>
            e.entryName.toLowerCase().endsWith('/index.html')
        )

        let rootFolder = ''

        if (indexEntry) {
            rootFolder = indexEntry.entryName.replace(/index\.html$/i, '')
        }

        // Build final path
        let targetFile = filename

        // If file is not already prefixed with root folder
        if (rootFolder && !filename.startsWith(rootFolder)) {
            targetFile = `${rootFolder}${filename}`
        }

        const cleanFilename = targetFile.replace(/^\/+/, '')

        const entry =
            zip.getEntry(cleanFilename) ||
            zip.getEntry(decodeURIComponent(cleanFilename))

        if (!entry) {
            return res.status(404).send(`File not found in zip: ${cleanFilename}`)
        }

        const ext = path.extname(cleanFilename).toLowerCase()

        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.wasm': 'application/wasm',
            '.data': 'application/octet-stream',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain',
            '.gz': 'application/gzip',
            '.br': 'application/octet-stream',
        }

        const contentType =
            mimeTypes[ext] ?? 'application/octet-stream'

        res.setHeader('Content-Type', contentType)

        // Unity WebGL
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

        res.send(entry.getData())

    } catch (err) {
        next(err)
    }
})

module.exports = router;