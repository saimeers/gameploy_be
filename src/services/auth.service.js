const { PrismaClient } = require('@prisma/client');
const { ConflictError } = require('../utils/errors');
const { sendWelcomeEmail } = require('./email.service');

const prisma = new PrismaClient();

/**
 * Called after Firebase Auth creates the user on the client.
 * Creates the local DB record if it doesn't exist yet.
 */
const registerUser = async ({ firebase_uid, nombre, correo }) => {
  const existing = await prisma.usuario.findUnique({ where: { firebase_uid } });
  if (existing) throw new ConflictError('User already registered');

  const correoTaken = await prisma.usuario.findUnique({ where: { correo } });
  if (correoTaken) throw new ConflictError('Email already in use');

  // Default role: estudiante
  const rol = await prisma.rol.findUnique({ where: { nombre: 'estudiante' } });

  const usuario = await prisma.usuario.create({
    data: { firebase_uid, nombre, correo, id_rol: rol.id },
    include: { rol: true },
  });

  // Non-blocking welcome email
  sendWelcomeEmail({ toEmail: correo, nombre }).catch(console.error);

  return usuario;
};

/**
 * Sync user on login: if DB record missing (e.g. Google first login), create it.
 */
const syncUser = async ({ firebase_uid, nombre, correo }) => {
  let usuario = await prisma.usuario.findUnique({
    where: { firebase_uid },
    include: { rol: true },
  });

  if (!usuario) {
    usuario = await registerUser({ firebase_uid, nombre, correo });
  }

  return usuario;
};

module.exports = { registerUser, syncUser };