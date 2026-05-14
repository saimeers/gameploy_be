const admin = require('../config/firebase');
const { UnauthorizedError } = require('../utils/errors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Verify Firebase ID token from Authorization header.
 * Attaches req.user = { uid, email, dbUser } on success.
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed authorization header');
    }

    const token = authHeader.split(' ')[1];

    const decoded = await admin.auth().verifyIdToken(token);

    const dbUser = await prisma.usuario.findUnique({
      where: { firebase_uid: decoded.uid },
      include: { rol: true },
    });

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      dbUser: dbUser || null,
    };

    next();
  } catch (err) {
    if (err.isOperational) return next(err);

    next(new UnauthorizedError('Invalid or expired token'));
  }
};

const requireRegisteredUser = (req, _res, next) => {
  if (!req.user.dbUser) {
    return next(new UnauthorizedError('User not registered in the system'));
  }

  if (!req.user.dbUser.activo) {
    return next(new UnauthorizedError('Account is disabled'));
  }

  if (dbUser.rol.nombre === 'pendiente') {
    throw new AppError('Your account is pending admin approval', 403);
  }

  next();
};

/**
 * Optional auth: attaches req.user if token present, continues anyway.
 * Used for public routes that show extra info when authenticated.
 */
const optionalToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token);

    const dbUser = await prisma.usuario.findUnique({
      where: { firebase_uid: decoded.uid },
      include: { rol: true },
    });

    if (dbUser?.activo) {
      req.user = { uid: decoded.uid, email: decoded.email, dbUser };
    }
  } catch (_) {
    // silently ignore invalid tokens on optional routes
  }
  next();
};

module.exports = { verifyToken, requireRegisteredUser, optionalToken };