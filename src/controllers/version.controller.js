const versionService = require('../services/version.service');
const { success } = require('../utils/response');

const create = async (req, res, next) => {
  try {
    const version = await versionService.createVersion(req.params.projectId, req.user.dbUser.id, req.body);
    success(res, { data: version, message: 'Version created', statusCode: 201 });
  } catch (err) { next(err); }
};

const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) return next(new Error('No file provided'));
    const { fileType } = req.body;
    const archivo = await versionService.uploadVersionFile(
      req.params.versionId,
      req.user.dbUser.id,
      req.file,
      fileType
    );
    success(res, { data: archivo, message: 'File uploaded', statusCode: 201 });
  } catch (err) { next(err); }
};

const setActive = async (req, res, next) => {
  try {
    const version = await versionService.setActiveVersion(req.params.versionId, req.user.dbUser.id);
    success(res, { data: version, message: 'Active version updated' });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const versions = await versionService.getVersions(req.params.projectId);
    success(res, { data: versions });
  } catch (err) { next(err); }
};

module.exports = { create, uploadFile, setActive, list };