const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { uploadFile, deleteFile, buildStorageKey } = require('./storage.service');

const prisma = new PrismaClient();

const createVersion = async (projectId, userId, { numero_version, notas_version }) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.id_usuario !== userId) throw new ForbiddenError('You do not own this project');

  // Deactivate previous active version
  await prisma.versionProyecto.updateMany({
    where: { id_proyecto: projectId, es_activa: true },
    data: { es_activa: false },
  });

  return prisma.versionProyecto.create({
    data: { id_proyecto: projectId, numero_version, notas_version, es_activa: true },
  });
};

const uploadVersionFile = async (versionId, userId, file, fileType) => {
  const version = await prisma.versionProyecto.findUnique({
    where: { id: versionId },
    include: { proyecto: true },
  });

  if (!version) {
    throw new NotFoundError('Version not found');
  }

  if (version.proyecto.id_usuario !== userId) {
    throw new ForbiddenError('Not authorized');
  }

  const finalFilename =
    fileType === 'juego_webgl'
      ? 'game.zip'
      : file.originalname;

  const key = buildStorageKey(
    version.id_proyecto,
    versionId,
    finalFilename
  );

  await uploadFile({
    buffer: file.buffer,
    key,
    mimetype: file.mimetype,
  });

  return prisma.archivo.create({
    data: {
      id_version: versionId,
      tipo: fileType,
      nombre_archivo: finalFilename,
      ruta_storage: key,
      tamanio_bytes: file.size,
    },
  });
};

const setActiveVersion = async (versionId, userId) => {
  const version = await prisma.versionProyecto.findUnique({
    where: { id: versionId },
    include: { proyecto: true },
  });
  if (!version) throw new NotFoundError('Version not found');
  if (version.proyecto.id_usuario !== userId) throw new ForbiddenError('Not authorized');

  await prisma.versionProyecto.updateMany({
    where: { id_proyecto: version.id_proyecto, es_activa: true },
    data: { es_activa: false },
  });

  return prisma.versionProyecto.update({
    where: { id: versionId },
    data: { es_activa: true },
    include: { archivos: true },
  });
};

const getVersions = async (projectId) => {
  return prisma.versionProyecto.findMany({
    where: { id_proyecto: projectId },
    include: { archivos: true },
    orderBy: { fecha_subida: 'desc' },
  });
};

const replaceOrAddFile = async (versionId, userId, file, fileType) => {
  const version = await prisma.versionProyecto.findUnique({
    where: { id: versionId },
    include: { proyecto: true, archivos: true },
  })
  if (!version) throw new NotFoundError('Version not found')
  if (version.proyecto.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  // For portada and juego_webgl: replace existing
  if (fileType === 'portada' || fileType === 'juego_webgl') {
    const existing = version.archivos.filter(a => a.tipo === fileType)
    for (const old of existing) {
      await deleteFile(old.ruta_storage).catch(() => {})
      await prisma.archivo.delete({ where: { id: old.id } })
    }
  }

  const key = buildStorageKey(version.id_proyecto, versionId, `${Date.now()}_${file.originalname}`)
  await uploadFile({ buffer: file.buffer, key, mimetype: file.mimetype })

  return prisma.archivo.create({
    data: {
      id_version: versionId,
      tipo: fileType,
      nombre_archivo: file.originalname,
      ruta_storage: key,
      tamanio_bytes: file.size,
    },
  })
}

module.exports = { createVersion, uploadVersionFile: replaceOrAddFile, setActiveVersion, getVersions }