const adminService = require('../services/admin.service');
const userService = require('../services/user.service');
const { success } = require('../utils/response');

const getStats = async (req, res, next) => {
  try {
    const stats = await adminService.getStats();
    success(res, { data: stats });
  } catch (err) { next(err); }
};

const getAllProjects = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await adminService.getAllProjects({ page: Number(page) || 1, limit: Number(limit) || 20 });
    success(res, { data: result.projects, meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (err) { next(err); }
};

const getProject = async (req, res, next) => {
  try {
    const project = await adminService.getProjectById(req.params.id);
    success(res, { data: project });
  } catch (err) { next(err); }
};

const toggleFeatured = async (req, res, next) => {
  try {
    const project = await adminService.toggleFeatured(req.params.id, req.body.destacado);
    success(res, { data: project, message: 'Featured status updated' });
  } catch (err) { next(err); }
};

const deleteProject = async (req, res, next) => {
  try {
    await adminService.adminDeleteProject(req.params.id);
    success(res, { message: 'Project deleted by admin' });
  } catch (err) { next(err); }
};

const deleteFile = async (req, res, next) => {
  try {
    await adminService.adminDeleteFile(req.params.id);
    success(res, { message: 'File permanently deleted' });
  } catch (err) { next(err); }
};

const getUser = async (req, res, next) => {
  try {
    const profile = await userService.getProfile(req.params.id);
    success(res, { data: profile });
  } catch (err) { next(err); }
};

const approveUser = async (req, res, next) => {
  try {
    const user = await adminService.approveUser(req.params.id);
    success(res, { data: user, message: 'User approved' });
  } catch (err) { next(err); }
};

module.exports = {
  getStats,
  getAllProjects,
  getProject,
  toggleFeatured,
  deleteProject,
  deleteFile,
  getUser,
  approveUser,
};