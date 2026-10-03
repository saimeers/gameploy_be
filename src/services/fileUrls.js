const { signedUrl } = require('../utils/cdnToken');
const { getPublicFilesConfig } = require('../config/publicFiles');
const { getPresignedUrl } = require('./storage.service');

/**
 * Add ready-to-use links to every file (Archivo) inside an API response:
 * `play_url` for a game build and `url` for an image.
 *
 * Call it only on responses the requester is already allowed to see. That
 * check is the access control: there is no endpoint that signs arbitrary
 * files, so whoever cannot see a project never gets a link to its files.
 * Links expire (see utils/cdnToken.js), and the stored manifest and storage
 * keys are left out of the response.
 *
 * Files published before the CDN existed get a presigned link to the main
 * bucket (images) or no play_url (builds, which the frontend then loads
 * through /play).
 */

const isArchivo = (node) =>
  node && typeof node === 'object' && typeof node.tipo === 'string' && 'ruta_storage' in node;

const collect = (node, found) => {
  if (Array.isArray(node)) {
    node.forEach(item => collect(item, found));
  } else if (isArchivo(node)) {
    found.push(node);
  } else if (node && typeof node === 'object' && !(node instanceof Date) && !Buffer.isBuffer(node)) {
    Object.values(node).forEach(value => collect(value, found));
  }
};

const linkFor = (archivo, cfg, nowMs) => {
  const [root, id, ...rest] = archivo.ruta_publica.split('/');
  return signedUrl({
    baseUrl: cfg.cdnUrl,
    secret: cfg.signingSecret,
    prefix: `${root}/${id}/`,
    file: archivo.tipo === 'juego_webgl' ? 'index.html' : rest.join('/'),
    nowMs,
  });
};

/**
 * @template T
 * @param {T} data a project, a list of projects, versions or files
 * @returns {Promise<T>} the same object, with links added in place
 */
const withFileUrls = async (data) => {
  const archivos = [];
  collect(data, archivos);
  if (!archivos.length) return data;

  const cfg = getPublicFilesConfig();
  const nowMs = Date.now();

  await Promise.all(archivos.map(async (archivo) => {
    if (archivo.ruta_publica && cfg.enabled) {
      archivo[archivo.tipo === 'juego_webgl' ? 'play_url' : 'url'] = linkFor(archivo, cfg, nowMs);
    } else if (archivo.tipo !== 'juego_webgl') {
      archivo.url = await getPresignedUrl(archivo.ruta_storage, 3600).catch(() => null);
    }
    delete archivo.manifiesto;
    delete archivo.ruta_storage;
    delete archivo.ruta_publica;
  }));

  return data;
};

module.exports = { withFileUrls };
