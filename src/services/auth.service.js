const admin = require('../config/firebase');
const { ValidationError } = require('../utils/errors');
const { PrismaClient } = require('@prisma/client');
const { ConflictError } = require('../utils/errors');
const { sendWelcomeEmail, sendPasswordResetEmail, sendPendingApprovalEmail } = require('./email.service');

const prisma = new PrismaClient();

/**
 * Called after Firebase Auth creates the user on the client.
 * Creates the local DB record if it doesn't exist yet.
 */
const registerUser = async ({ firebase_uid, nombre, correo, rol_solicitado }) => {
  const rolesPermitidos = ['estudiante', 'docente'];
  if (!rolesPermitidos.includes(rol_solicitado)) {
    throw new ValidationError('rol_solicitado must be estudiante or docente');
  }

  const existing = await prisma.usuario.findUnique({ where: { firebase_uid } });
  if (existing) throw new ConflictError('User already registered');

  const correoTaken = await prisma.usuario.findUnique({ where: { correo } });
  if (correoTaken) throw new ConflictError('Email already in use');

  const rolPendiente = await prisma.rol.findUnique({ where: { nombre: 'pendiente' } });

  const usuario = await prisma.usuario.create({
    data: {
      firebase_uid,
      nombre,
      correo,
      id_rol: rolPendiente.id,
      rol_solicitado, 
    },
    include: { rol: true },
  });

  sendWelcomeEmail({ toEmail: correo, nombre }).catch(console.error);
  sendPendingApprovalEmail({ nombre, correo, rol: rol_solicitado,}).catch(console.error);

  return usuario;
};

/**
 * Sync user on login: if DB record missing (e.g. Google first login), create it.
 */
const syncUser = async ({ firebase_uid, nombre, correo, rol_solicitado }) => {
  let usuario = await prisma.usuario.findUnique({
    where: { firebase_uid },
    include: { rol: true },
  });

  if (!usuario) {
    usuario = await registerUser({
      firebase_uid,
      nombre,
      correo,
      rol_solicitado: rol_solicitado || 'estudiante', 
    });
  }

  return usuario;
};

const generatePasswordResetLink = async (correo) => {
  const user = await prisma.usuario.findUnique({ where: { correo } })
  if (!user) {
    return
  }

  const actionCodeSettings = {
    url: `${process.env.FRONTEND_URL}/reset-password`,
    handleCodeInApp: true,
  }

  const firebaseLink = await admin.auth().generatePasswordResetLink(correo, actionCodeSettings)

  const urlObj = new URL(firebaseLink)
  const oobCode = urlObj.searchParams.get('oobCode')

  const customLink = `${process.env.FRONTEND_URL}/reset-password?oobCode=${oobCode}`

  await sendPasswordResetEmail({ 
    toEmail: correo, 
    nombre: user.nombre, 
    resetLink: customLink 
  })
}

module.exports = { registerUser, syncUser, generatePasswordResetLink };