const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { uploadFile, deleteFile, getPresignedUrl, buildStorageKey } = require('./storage.service');
const { isPublishingEnabled, publishArchivo } = require('./publish.service');
const { removeArchivo } = require('./archivo.service');
const { invalidatePublicData } = require('./cache.service');

const prisma = new PrismaClient();

/**
 * Create a version and carry over the files of the currently active one.
 *
 * A new version rarely replaces every file: usually only the build changes, and
 * the cover and screenshots stay. The inherited rows point at the same object in
 * the bucket, so nothing is uploaded or copied twice, and each version still
 * holds the complete set of files it was published with.
 *
 * @param {string[]|undefined} heredar Ids of the active version's files to keep.
 *   Omitted carries them all; an empty array creates an empty version.
 */
const createVersion = async (projectId, userId, { numero_version, notas_version, heredar }) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  if (project.id_usuario !== userId) throw new ForbiddenError('You do not own this project');

  const previous = await prisma.versionProyecto.findFirst({
    where: { id_proyecto: projectId, es_activa: true },
    include: { archivos: true },
  });

  const source = previous?.archivos ?? [];
  const inherited = Array.isArray(heredar)
    ? source.filter(archivo => heredar.includes(archivo.id))
    : source;

  // Deactivate previous active version
  await prisma.versionProyecto.updateMany({
    where: { id_proyecto: projectId, es_activa: true },
    data: { es_activa: false },
  });

  const version = await prisma.versionProyecto.create({
    data: {
      id_proyecto: projectId,
      numero_version,
      notas_version,
      es_activa: true,
      archivos: {
        create: inherited.map(archivo => ({
          tipo:           archivo.tipo,
          nombre_archivo: archivo.nombre_archivo,
          ruta_storage:   archivo.ruta_storage,
          tamanio_bytes:  archivo.tamanio_bytes,
          ruta_publica:   archivo.ruta_publica,
          manifiesto:     archivo.manifiesto ?? undefined,
        })),
      },
    },
    include: { archivos: true },
  });
  await invalidatePublicData();
  return version;
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

  const archivo = await prisma.archivo.create({
    data: {
      id_version: versionId,
      tipo: fileType,
      nombre_archivo: finalFilename,
      ruta_storage: key,
      tamanio_bytes: file.size,
    },
  });
  await invalidatePublicData();
  return archivo;
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

  const active = await prisma.versionProyecto.update({
    where: { id: versionId },
    data: { es_activa: true },
    include: { archivos: true },
  });
  await invalidatePublicData();
  return active;
};

/** Owner or admin; anyone else gets 403, since versions carry the game files. */
const assertCanManage = (project, requestingUser) => {
  const isOwner = project.id_usuario === requestingUser.dbUser.id;
  const isAdmin = requestingUser.dbUser.rol.nombre === 'admin';
  if (!isOwner && !isAdmin) throw new ForbiddenError('Not authorized');
};

const getVersions = async (projectId, requestingUser) => {
  const project = await prisma.proyecto.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project not found');
  assertCanManage(project, requestingUser);

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
      await removeArchivo(old)
    }
  }

  const key = buildStorageKey(version.id_proyecto, versionId, `${Date.now()}_${file.originalname}`)
  await uploadFile({ buffer: file.buffer, key, mimetype: file.mimetype })

  // The copy players download. If publishing fails, the upload is undone so
  // no row ever points at a half-published file.
  let published = {}
  if (isPublishingEnabled()) {
    try {
      published = await publishArchivo({ tipo: fileType, nombre_archivo: file.originalname }, file.buffer, file.mimetype)
    } catch (err) {
      await deleteFile(key).catch(() => {})
      throw err
    }
  }

  const archivo = await prisma.archivo.create({
    data: {
      id_version: versionId,
      tipo: fileType,
      nombre_archivo: file.originalname,
      ruta_storage: key,
      tamanio_bytes: file.size,
      ...published,
    },
  })
  await invalidatePublicData()
  return archivo
}

/**
 * Short-lived link to download the original upload (the game .zip or an
 * image), for the project's owner.
 */
const getDownloadUrl = async (fileId, userId) => {
  const archivo = await prisma.archivo.findUnique({
    where: { id: fileId },
    include: { version: { include: { proyecto: true } } },
  })
  if (!archivo) throw new NotFoundError('File not found')
  if (archivo.version.proyecto.id_usuario !== userId) throw new ForbiddenError('Not authorized')

  return { url: await getPresignedUrl(archivo.ruta_storage, 300, archivo.nombre_archivo) }
}

/**
 * Delete one file of a version, both from the bucket and from the database.
 * Only the owner of the project the file belongs to may delete it.
 */
const deleteVersionFile = async (fileId, userId) => {
  const archivo = await prisma.archivo.findUnique({
    where: { id: fileId },
    include: { version: { include: { proyecto: true } } },
  })

  if (!archivo) throw new NotFoundError('File not found')
  if (archivo.version.proyecto.id_usuario !== userId) {
    throw new ForbiddenError('Not authorized')
  }

  await removeArchivo(archivo)
  await invalidatePublicData()
}

module.exports = {
  getDownloadUrl,
  createVersion,
  uploadVersionFile: replaceOrAddFile,
  setActiveVersion,
  getVersions,
  deleteVersionFile,
}