/**
 * Publish the files uploaded before the CDN existed (Archivo rows without
 * ruta_publica): download each original from the main bucket, publish it
 * (R2, or the local folder in development) and store where it went.
 *
 *   npm run publish:existing            # publish everything pending
 *   npm run publish:existing -- --dry-run   # only list what would be published
 *
 * Safe to run again: it only picks rows that are still pending, and rows that
 * share an object (inherited by later versions) are published once.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { getObjectBuffer } = require('../src/services/storage.service');
const { isPublishingEnabled, publishArchivo } = require('../src/services/publish.service');
const { getPublicFilesConfig } = require('../src/config/publicFiles');

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  if (!isPublishingEnabled()) {
    console.error('Publishing is disabled: set R2_BUCKET, CDN_URL and CDN_SIGNING_SECRET first.');
    process.exitCode = 1;
    return;
  }

  const pending = await prisma.archivo.findMany({
    where: { ruta_publica: null },
    orderBy: { fecha_subida: 'asc' },
  });
  const groups = new Map();
  for (const archivo of pending) {
    if (!groups.has(archivo.ruta_storage)) groups.set(archivo.ruta_storage, []);
    groups.get(archivo.ruta_storage).push(archivo);
  }

  console.log(`${groups.size} file(s) to publish (${pending.length} rows) to ${getPublicFilesConfig().driver}${dryRun ? ' [dry run]' : ''}`);

  let published = 0;
  let failed = 0;
  for (const [ruta, rows] of groups) {
    const [first] = rows;
    if (dryRun) {
      console.log(`  - ${first.tipo} ${ruta}`);
      continue;
    }
    try {
      const buffer = await getObjectBuffer(ruta);
      const result = await publishArchivo(first, buffer);
      await prisma.archivo.updateMany({
        where: { ruta_storage: ruta, ruta_publica: null },
        data: result,
      });
      published++;
      console.log(`  ✓ ${first.tipo} ${ruta} → ${result.ruta_publica}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${first.tipo} ${ruta}: ${err.message}`);
    }
  }

  if (!dryRun) console.log(`Done: ${published} published, ${failed} failed.`);
  if (failed) process.exitCode = 1;
};

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
