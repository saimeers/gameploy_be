const commentService = require('../services/comment.service');
const { success } = require('../utils/response');

const add = async (req, res, next) => {
  try {
    const comment = await commentService.addComment(req.params.projectId, req.user.dbUser.id, req.body);
    success(res, { data: comment, message: 'Comment added', statusCode: 201 });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const comments = await commentService.getComments(req.params.projectId);
    success(res, { data: comments });
  } catch (err) { next(err); }
};

const moderate = async (req, res, next) => {
  try {
    const comment = await commentService.moderateComment(req.params.id, req.body.activo);
    success(res, { data: comment, message: 'Comment moderated' });
  } catch (err) { next(err); }
};

module.exports = { add, list, moderate };