const userService = require('../services/user.service');
const { success } = require('../utils/response');

const getMe = async (req, res, next) => {
  try {
    const profile = await userService.getProfile(req.user.dbUser.id);
    success(res, { data: profile });
  } catch (err) { next(err); }
};

const updateMe = async (req, res, next) => {
  try {
    const updated = await userService.updateProfile(req.user.dbUser.id, req.body);
    success(res, { data: updated, message: 'Profile updated' });
  } catch (err) { next(err); }
};

// Admin only
const getAll = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await userService.getAllUsers({ page: Number(page) || 1, limit: Number(limit) || 20 });
    success(res, { data: result.users, meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (err) { next(err); }
};

const updateRole = async (req, res, next) => {
  try {
    const updated = await userService.updateUserRole(req.params.id, req.body.rol);
    success(res, { data: updated, message: 'Role updated' });
  } catch (err) { next(err); }
};

const toggleStatus = async (req, res, next) => {
  try {
    const updated = await userService.toggleUserStatus(req.params.id, req.body.activo);
    success(res, { data: updated, message: 'Status updated' });
  } catch (err) { next(err); }
};

module.exports = { getMe, updateMe, getAll, updateRole, toggleStatus };