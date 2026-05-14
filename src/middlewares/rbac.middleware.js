const { ForbiddenError } = require('../utils/errors');

/**
 * Allow only users with one of the specified roles.
 * Must be used after verifyToken.
 * @param {...string} roles - e.g. requireRoles('admin', 'docente')
 */
const requireRoles = (...roles) => {
  return (req, _res, next) => {
    const userRole = req.user?.dbUser?.rol?.nombre;
    if (!userRole || !roles.includes(userRole)) {
      return next(new ForbiddenError(`Access restricted to: ${roles.join(', ')}`));
    }
    next();
  };
};

module.exports = { requireRoles };