const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const { Upload } = require('@aws-sdk/lib-storage');
const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getR2Client } = require('../config/r2');
const { getPublicFilesConfig } = require('../config/publicFiles');
const { extractBuild, describeBuild, contentTypeFor, injectProgressReporter } = require('./play.service');
const { ValidationError } = require('../utils/errors');

/**
 * Publishing copies what players download (unpacked game builds and images)
 * to the public file storage: R2 in production, a local folder in development.
 * The original upload stays in the main bucket as the source of truth, so a
 * published copy can always be rebuilt (scripts/publish-existing.js).
 *
 * Every publish gets a fresh random folder, so a URL never changes content and
 * can be cached for a year. The game's index.html is the exception: it is
 * cached briefly so the injected progress script can be updated.
 */

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT_LIVED = 'public, max-age=300';
const UPLOAD_CONCURRENCY = 4;

const isPublishingEnabled = () => getPublicFilesConfig().enabled;

const putObject = async (key, body, contentType, cacheControl) => {
  const cfg = getPublicFilesConfig();
  if (cfg.driver === 'r2') {
    await new Upload({
      client: getR2Client(),
      params: { Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl },
    }).done();
    return;
  }
  const file = path.join(cfg.localDir, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
};

/** Delete every object under a prefix (`builds/<id>/` or `media/<id>/`). */
const removePrefix = async (prefix) => {
  const cfg = getPublicFilesConfig();
  if (cfg.driver === 'r2') {
    const client = getR2Client();
    let token;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token,
      }));
      const keys = (page.Contents ?? []).map(o => ({ Key: o.Key }));
      if (keys.length) {
        await client.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys } }));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return;
  }
  if (cfg.driver === 'local') {
    await fs.rm(path.join(cfg.localDir, prefix), { recursive: true, force: true });
  }
};

/** Run `fn` over `items` with at most `size` calls in flight. */
const runPool = async (items, size, fn) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
};

/**
 * Unpack a game build and publish its files.
 * @param {Buffer} zipBuffer
 * @returns {Promise<{ ruta_publica: string, manifiesto: object }>}
 */
const publishBuild = async (zipBuffer) => {
  const build = extractBuild(zipBuffer);
  const manifiesto = describeBuild(build);
  if (!manifiesto.files.some(f => f.path === 'index.html')) {
    throw new ValidationError('The build has no index.html');
  }

  const prefix = `builds/${randomUUID()}/`;
  const files = manifiesto.files.map(f => ({ path: f.path, data: build.files.get(build.root + f.path) }));

  try {
    await runPool(files, UPLOAD_CONCURRENCY, async ({ path: file, data }) => {
      const isEntry = file === 'index.html';
      await putObject(
        prefix + file,
        isEntry ? Buffer.from(injectProgressReporter(data.toString('utf8'))) : data,
        contentTypeFor(file),
        isEntry ? SHORT_LIVED : IMMUTABLE,
      );
    });
  } catch (err) {
    await removePrefix(prefix).catch(() => {});
    throw err;
  }

  return { ruta_publica: prefix, manifiesto };
};

/** File name safe for a URL path: letters, digits, dots, dashes and underscores. */
const safeName = (name) =>
  (name || 'imagen').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120);

/**
 * Publish one image (cover or screenshot).
 * @returns {Promise<{ ruta_publica: string }>}
 */
const publishImage = async (buffer, originalName, mimetype) => {
  const name = safeName(originalName);
  const key = `media/${randomUUID()}/${name}`;
  await putObject(key, buffer, mimetype || contentTypeFor(name), IMMUTABLE);
  return { ruta_publica: key };
};

/** Remove a published build or image, given the ruta_publica stored on its Archivo. */
const removePublished = async (rutaPublica) => {
  if (!rutaPublica) return;
  const [root, id] = rutaPublica.split('/');
  if (!root || !id) return;
  await removePrefix(`${root}/${id}/`);
};

/** Publish an Archivo's original upload, whatever its type. */
const publishArchivo = async ({ tipo, nombre_archivo }, buffer, mimetype) =>
  tipo === 'juego_webgl' ? publishBuild(buffer) : publishImage(buffer, nombre_archivo, mimetype);

module.exports = {
  isPublishingEnabled,
  publishBuild,
  publishImage,
  publishArchivo,
  removePublished,
  safeName,
};
