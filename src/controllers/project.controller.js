const projectService = require('../services/project.service');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const project = await projectService.createProject(req.user.dbUser.id, req.body);
    success(res, { data: project, message: 'Project created', statusCode: 201 });
  } catch (err) { next(err); }
};

const getBySlug = async (req, res, next) => {
  try {
    const project = await projectService.getProjectBySlug(req.params.slug, req.user);
    await projectService.recordVisit(project.id, req.headers.referer || null);
    success(res, { data: project });
  } catch (err) { next(err); }
};

const getMine = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await projectService.getMyProjects(req.user.dbUser.id, {
      page: Number(page) || 1,
      limit: Number(limit) || 12,
    });
    success(res, { data: result.projects, meta: { total: result.total, page: result.page, limit: result.limit } });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.user.dbUser.id, req.body);
    success(res, { data: project, message: 'Project updated' });
  } catch (err) { next(err); }
};

const publish = async (req, res, next) => {
  try {
    const project = await projectService.publishProject(req.params.id, req.user.dbUser.id);
    success(res, { data: project, message: 'Project published' });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await projectService.deleteProject(req.params.id, req.user);
    success(res, { message: 'Project deleted' });
  } catch (err) { next(err); }
};

module.exports = { create, getBySlug, getMine, update, publish, remove };