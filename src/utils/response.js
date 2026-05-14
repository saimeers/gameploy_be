/**
 * Send a standardised success response.
 * @param {import('express').Response} res
 * @param {object} options
 */
const success = (res, { data = null, message = 'OK', statusCode = 200, meta = null } = {}) => {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

/**
 * Send a standardised error response.
 * @param {import('express').Response} res
 * @param {object} options
 */
const error = (res, { message = 'Internal server error', statusCode = 500, errors = null } = {}) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

module.exports = { success, error };