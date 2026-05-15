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
router.get(
    /^\/play\/([^/]+)\/([^/]+)\/(.+)$/,
    async (req, res, next) => {
        try {
            const projectId = req.params[0]
            const versionId = req.params[1]
            let filename = req.params[2]

            const archivo = await prisma.archivo.findFirst({
                where: {
                    id_version: versionId,
                    tipo: 'juego_webgl'
                }
            })

            if (!archivo) {
                return res.status(404).send('Game not found')
            }

            // Get presigned URL
            const zipUrl = await getPresignedUrl(
                archivo.ruta_storage,
                300
            )

            // Download ZIP
            const zipBuffer = await new Promise((resolve, reject) => {
                const protocol = zipUrl.startsWith('https')
                    ? https
                    : http

                const chunks = []

                protocol.get(zipUrl, resp => {
                    resp.on('data', chunk => chunks.push(chunk))

                    resp.on('end', () => {
                        resolve(Buffer.concat(chunks))
                    })

                    resp.on('error', reject)
                }).on('error', reject)
            })

            // Open ZIP
            const zip = new AdmZip(zipBuffer)

            filename = decodeURIComponent(
                filename.replace(/^\/+/, '')
            )

            const allEntries = zip.getEntries()

            // Exact match
            let entry = allEntries.find(
                e => e.entryName === filename
            )

            // Without leading slash
            if (!entry) {
                entry = allEntries.find(
                    e =>
                        e.entryName ===
                        filename.replace(/^\/+/, '')
                )
            }

            // Match inside root folder
            if (!entry) {
                entry = allEntries.find(
                    e =>
                        e.entryName.endsWith('/' + filename) ||
                        e.entryName.endsWith(filename)
                )
            }

            console.log('REQUESTED FILE:', filename)
            console.log('MATCH:', entry?.entryName)

            if (!entry) {
                console.log(
                    'ZIP ENTRIES:',
                    allEntries.map(e => e.entryName)
                )

                return res
                    .status(404)
                    .send(`File not found in zip: ${filename}`)
            }

            const entryName = entry.entryName.toLowerCase()

            // MIME TYPES
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

            const ext = path
                .extname(entryName)
                .toLowerCase()

            const contentType =
                mimeTypes[ext] ||
                'application/octet-stream'

            res.setHeader(
                'Content-Type',
                contentType
            )

            // Unity-specific MIME fixes
            if (entryName.endsWith('.wasm')) {
                res.setHeader(
                    'Content-Type',
                    'application/wasm'
                )
            }

            if (entryName.endsWith('.js')) {
                res.setHeader(
                    'Content-Type',
                    'application/javascript'
                )
            }

            if (entryName.endsWith('.css')) {
                res.setHeader(
                    'Content-Type',
                    'text/css'
                )
            }

            if (entryName.endsWith('.data')) {
                res.setHeader(
                    'Content-Type',
                    'application/octet-stream'
                )
            }

            // GZIP support
            if (entryName.endsWith('.gz')) {
                res.setHeader(
                    'Content-Encoding',
                    'gzip'
                )

                if (entryName.includes('.wasm')) {
                    res.setHeader(
                        'Content-Type',
                        'application/wasm'
                    )
                }

                if (entryName.includes('.js')) {
                    res.setHeader(
                        'Content-Type',
                        'application/javascript'
                    )
                }

                if (entryName.includes('.data')) {
                    res.setHeader(
                        'Content-Type',
                        'application/octet-stream'
                    )
                }
            }

            // Brotli support
            if (entryName.endsWith('.br')) {
                res.setHeader(
                    'Content-Encoding',
                    'br'
                )
            }

            // CORS + Unity headers
            res.setHeader(
                'Access-Control-Allow-Origin',
                '*'
            )

            res.setHeader(
                'Cross-Origin-Resource-Policy',
                'cross-origin'
            )

            res.setHeader(
                'Cross-Origin-Embedder-Policy',
                'require-corp'
            )

            res.setHeader(
                'Cross-Origin-Opener-Policy',
                'same-origin'
            )

            // Send file
            res.send(entry.getData())

        } catch (err) {
            next(err)
        }
    }
)

module.exports = router;