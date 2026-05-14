const { registerUser, syncUser } = require('../services/auth.service');
const { success } = require('../utils/response');

const register = async (req, res, next) => {
  try {
    const { nombre, correo, rol_solicitado } = req.body; 
    const { uid } = req.user;
    const user = await registerUser({ firebase_uid: uid, nombre, correo, rol_solicitado });
    success(res, { data: user, message: 'User registered. Pending admin approval.', statusCode: 201 });
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

const forgotPassword = async (req, res, next) => {
  try {
    const { correo } = req.body
    await authService.generatePasswordResetLink(correo)
    // Always respond 200 — don't reveal if email exists
    success(res, { message: 'If that email exists, a reset link has been sent.' })
  } catch (err) {
    next(err)
  }
}

module.exports = { register, sync, forgotPassword };