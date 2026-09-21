const { PrismaClient } = require('@prisma/client');
const { deleteFile } = require('./storage.service');

const prisma = new PrismaClient();

/**
 * Delete an Archivo row and, only when no other row still points at the same
 * object, the object itself.
 *
 * A version that inherits files from the previous one reuses their storage key,
 * so several rows can share `ruta_storage`: removing the object as soon as one
 * of them is deleted would leave the other versions pointing at nothing.
 *
 * @param {{ id: string, ruta_storage: string }} archivo
 */
const removeArchivo = async (archivo) => {
  await prisma.archivo.delete({ where: { id: archivo.id } });

  const stillReferenced = await prisma.archivo.count({
    where: { ruta_storage: archivo.ruta_storage },
  });

  if (stillReferenced === 0) {
    await deleteFile(archivo.ruta_storage).catch(() => {});
  }

  return archivo;
};

module.exports = { removeArchivo };
