const { PrismaClient } = require('@prisma/client');
const { deleteFile } = require('./storage.service');
const { forgetBuild } = require('./play.service');
const { removePublished } = require('./publish.service');

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
  await removeOrphanedObjects([archivo]);
  return archivo;
};

/**
 * Delete from storage the files that no Archivo row points at any more: the
 * original in the main bucket and its published copy. Call it after deleting
 * the rows.
 * @param {{ ruta_storage: string, ruta_publica?: string | null }[]} archivos duplicates allowed
 */
const removeOrphanedObjects = async (archivos) => {
  const byKey = new Map(archivos.map(a => [a.ruta_storage, a.ruta_publica]));
  for (const [ruta, rutaPublica] of byKey) {
    const stillReferenced = await prisma.archivo.count({ where: { ruta_storage: ruta } });
    if (stillReferenced === 0) {
      await deleteFile(ruta).catch(() => {});
      await removePublished(rutaPublica).catch(() => {});
      forgetBuild(ruta);
    }
  }
};

module.exports = { removeArchivo, removeOrphanedObjects };
