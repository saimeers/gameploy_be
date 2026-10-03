const { PrismaClient } = require('@prisma/client');
const { deleteFile } = require('./storage.service');
const { forgetBuild } = require('./play.service');

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
  await removeOrphanedObjects([archivo.ruta_storage]);
  return archivo;
};

/**
 * Delete from the bucket the given objects that no Archivo row points at any
 * more. Call it after deleting the rows.
 * @param {string[]} rutas storage keys, duplicates allowed
 */
const removeOrphanedObjects = async (rutas) => {
  for (const ruta of new Set(rutas)) {
    const stillReferenced = await prisma.archivo.count({ where: { ruta_storage: ruta } });
    if (stillReferenced === 0) {
      await deleteFile(ruta).catch(() => {});
      forgetBuild(ruta);
    }
  }
};

module.exports = { removeArchivo, removeOrphanedObjects };
