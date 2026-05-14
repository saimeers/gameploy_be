const router = require('express').Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const projectRoutes = require('./project.routes');
const versionRoutes = require('./version.routes');
const commentRoutes = require('./comment.routes');
const searchRoutes = require('./search.routes');
const adminRoutes = require('./admin.routes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/projects/:projectId/versions', versionRoutes);
router.use('/projects/:projectId/comments', commentRoutes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);

module.exports = router;