const { registerUser, syncUser } = require('../services/auth.service');
const { success } = require('../utils/response');

const register = async (req, res, next) => {
  try {
    const { nombre, correo } = req.body;
    const { uid } = req.user; // verified by verifyToken middleware
    const user = await registerUser({ firebase_uid: uid, nombre, correo });
    success(res, { data: user, message: 'User registered successfully', statusCode: 201 });
  } catch (err) {
    next(err);
  }
};

/**
 * Called on every login (email/pass or Google) to sync the DB record.
 */
const sync = async (req, res, next) => {
  try {
    const { nombre, correo } = req.body;
    const { uid } = req.user;
    const user = await syncUser({ firebase_uid: uid, nombre, correo });
    success(res, { data: user, message: 'User synced' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, sync };