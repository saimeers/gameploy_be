const { PrismaClient } = require('@prisma/client');
const admin = require('../config/firebase')
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');

/** Mismo límite que declara el frontend en `LIMITS.nombreUsuario`. */
const MAX_NOMBRE = 80;

const prisma = new PrismaClient();

/**
 * Photo of a user, taken from Firebase Auth. Never fails the caller: a profile
 * without a picture is perfectly valid.
 */
const getPhotoURL = async (firebaseUid) => {
  if (!firebaseUid) return null;
  try {
    const firebaseUser = await admin.auth().getUser(firebaseUid);
    return firebaseUser.photoURL ?? null;
  } catch {
    return null;
  }
};

/**
 * Profile of a user: their basic data and the projects they have published,
 * with the cover of the active version so the page can show them as cards.
 * The photo comes from Firebase, which is where the identity lives.
 */
const getProfile = async (userId) => {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      rol: true,
      proyectos: {
        where: { estado: 'publicado' },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          slug: true,
          visibilidad: true,
          destacado: true,
          fecha_publicacion: true,
          categoria: true,
          versiones: {
            where: { es_activa: true },
            select: { archivos: { where: { tipo: 'portada' }, take: 1 } },
            take: 1,
          },
          _count: { select: { visitas: true, comentarios: true } },
        },
        orderBy: { fecha_publicacion: 'desc' },
      },
      _count: { select: { proyectos: true, comentarios: true } },
    },
  });

  if (!user) throw new NotFoundError('User not found');

  return { ...user, foto_perfil: await getPhotoURL(user.firebase_uid) };
};

const updateProfile = async (userId, { nombre }) => {
  const nombreLimpio = nombre?.trim();

  if (!nombreLimpio) throw new ValidationError('nombre is required');
  if (nombreLimpio.length > MAX_NOMBRE) {
    throw new ValidationError(`nombre must be at most ${MAX_NOMBRE} characters`);
  }

  return prisma.usuario.update({
    where: { id: userId },
    data: { nombre: nombreLimpio },
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