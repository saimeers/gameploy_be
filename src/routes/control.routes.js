const router = require('express').Router({ mergeParams: true })
const c      = require('../controllers/control.controller')
const { verifyToken } = require('../middlewares/auth.middleware')

/**
 * @swagger
 * /projects/{projectId}/controls:
 *   get:
 *     summary: List game controls for a project
 *     tags: [Controls]
 *   post:
 *     summary: Add a game control
 *     tags: [Controls]
 */
router.get('/',    c.list)
router.post('/',   verifyToken, c.create)
router.patch('/reorder', verifyToken, c.reorder)
router.patch('/:controlId', verifyToken, c.update)
router.delete('/:controlId', verifyToken, c.remove)

module.exports = router