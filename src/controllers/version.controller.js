const versionService = require('../services/version.service');
const { success } = require('../utils/response');
const { withFileUrls } = require('../services/fileUrls');

const create = async (req, res, next) => {
  try {
    const version = await versionService.createVersion(req.params.projectId, req.user.dbUser.id, req.body);
    success(res, { data: await withFileUrls(version), message: 'Version created', statusCode: 201 });
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
    success(res, { data: await withFileUrls(archivo), message: 'File uploaded', statusCode: 201 });
  } catch (err) { next(err); }
};

const setActive = async (req, res, next) => {
  try {
    const version = await versionService.setActiveVersion(req.params.versionId, req.user.dbUser.id);
    success(res, { data: await withFileUrls(version), message: 'Active version updated' });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const versions = await versionService.getVersions(req.params.projectId, req.user);
    success(res, { data: await withFileUrls(versions) });
  } catch (err) { next(err); }
};

const removeFile = async (req, res, next) => {
  try {
    await versionService.deleteVersionFile(req.params.fileId, req.user.dbUser.id);
    success(res, { message: 'File deleted' });
  } catch (err) { next(err); }
};

const download = async (req, res, next) => {
  try {
    success(res, { data: await versionService.getDownloadUrl(req.params.fileId, req.user.dbUser.id) });
  } catch (err) { next(err); }
};

module.exports = { create, uploadFile, setActive, list, removeFile, download };