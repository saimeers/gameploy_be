const { PrismaClient } = require('@prisma/client');
const admin = require('../config/firebase')
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const prisma = new PrismaClient();

const getProfile = async (userId) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      rol: true,
      proyectos: {
        where: { estado: 'publicado' },
        select: { id: true, nombre: true, slug: true, fecha_publicacion: true, categoria: true },
        orderBy: { fecha_publicacion: 'desc' },
      },
    },
  });
  if (!user) throw new NotFoundError('User not found');
  return user;
};

const updateProfile = async (userId, { nombre }) => {
  return prisma.usuario.update({
    where: { id: userId },
    data: { nombre },
    include: { rol: true },
  });
};

const getAllUsers = async ({ page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.usuario.findMany({
      skip,
      take: limit,
      include: { rol: true },
      orderBy: { fecha_registro: 'desc' },
    }),
    prisma.usuario.count(),
  ]);

  const usersWithPhotos = await Promise.all(
    users.map(async (user) => {
      try {
        if (!user.firebase_uid) {
          return {
            ...user,
            foto_perfil: null,
          };
        }

        const firebaseUser = await admin.auth().getUser(user.firebase_uid);

        return {
          ...user,
          foto_perfil: firebaseUser.photoURL ?? null,
        };
      } catch (err) {
        return {
          ...user,
          foto_perfil: null,
        };
      }
    })
  );

  return {
    users: usersWithPhotos,
    total,
    page,
    limit,
  };
};

const updateUserRole = async (userId, roleName) => {
  const rol = await prisma.rol.findUnique({ where: { nombre: roleName } });
  if (!rol) throw new NotFoundError('Role not found');

  return prisma.usuario.update({
    where: { id: userId },
    data: { id_rol: rol.id },
    include: { rol: true },
  });
};

const toggleUserStatus = async (userId, activo) => {
  return prisma.usuario.update({
    where: { id: userId },
    data: { activo },
    include: { rol: true },
  });
};

const checkUserByEmail = async (correo) => {
  const user = await prisma.usuario.findUnique({
    where: { correo },
    select: { id: true, correo: true }
  });
  return !!user;
};

module.exports = { getProfile, updateProfile, getAllUsers, updateUserRole, toggleUserStatus, checkUserByEmail };