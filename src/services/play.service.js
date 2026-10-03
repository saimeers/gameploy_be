const path = require('path');
const AdmZip = require('adm-zip');
const { getObjectBuffer } = require('./storage.service');

/**
 * Unity WebGL builds served from the .zip in the bucket.
 *
 * A game asks for about ten files while it boots (index.html, loader,
 * framework, data, wasm, styles, icons...). Each of those requests used to
 * download and open the whole .zip; now a build is downloaded once, unpacked in
 * memory and kept in an LRU cache capped by PLAY_CACHE_MB (256 by default).
 * Requests that arrive while a build is still downloading wait for that same
 * download instead of starting their own.
 */

/**
 * Part of the ETag of every served file. Bump it when the way files are served
 * changes (e.g. the injected script), so browsers drop the copies they keep.
 */
const SERVE_REVISION = 1;

const MB = 1024 * 1024;
const maxCacheBytes = () => (Number(process.env.PLAY_CACHE_MB) || 256) * MB;

/** ruta_storage → { files: Map<path, Buffer>, root, bytes }, least recently used first. */
const cache = new Map();
/** ruta_storage → Promise of the download in progress. */
const inflight = new Map();
let cachedBytes = 0;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.gz': 'application/gzip',
  '.br': 'application/octet-stream',
};

const contentTypeFor = (file) =>
  MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * Folder of the build inside the .zip: the one holding the least nested
 * index.html, so both a zip of the folder contents and a zip of the folder work.
 */
const findRoot = (names) => {
  const index = names
    .filter(n => n.toLowerCase() === 'index.html' || n.toLowerCase().endsWith('/index.html'))
    .sort((a, b) => a.length - b.length)[0];
  return index ? index.slice(0, -'index.html'.length) : '';
};

/** Open the .zip and return its files already decompressed. */
const extractBuild = (zipBuffer) => {
  const files = new Map();
  let bytes = 0;
  for (const entry of new AdmZip(zipBuffer).getEntries()) {
    // __MACOSX/ holds metadata from the macOS archiver, not part of the build.
    if (entry.isDirectory || entry.entryName.startsWith('__MACOSX/')) continue;
    const data = entry.getData();
    files.set(entry.entryName, data);
    bytes += data.length;
  }
  return { files, root: findRoot([...files.keys()]), bytes };
};

/**
 * Files of a build relative to its root, with the same checks the upload form
 * runs: a Gzip/Brotli build cannot be served, and the PWA template is expected.
 */
const describeBuild = (build) => {
  const files = [...build.files]
    .filter(([name]) => name.startsWith(build.root))
    .map(([name, data]) => ({ path: name.slice(build.root.length), size: data.length }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    root: build.root,
    totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
    compressed: files.some(f => /^Build\/.*\.(gz|br|unityweb)$/i.test(f.path)),
    pwa: files.some(f => f.path === 'manifest.webmanifest' || f.path === 'ServiceWorker.js'),
  };
};

const remember = (key, build) => {
  cache.set(key, build);
  cachedBytes += build.bytes;
  // Evict the least recently used builds until the cache fits. The build just
  // loaded stays even if it alone is over the cap, since it is about to be served.
  for (const [oldKey, old] of cache) {
    if (cachedBytes <= maxCacheBytes() || oldKey === key) break;
    cache.delete(oldKey);
    cachedBytes -= old.bytes;
  }
};

/**
 * Build of a `juego_webgl` file, from the cache or downloaded.
 * @param {string} rutaStorage key of the .zip in the bucket
 */
const loadBuild = async (rutaStorage) => {
  const hit = cache.get(rutaStorage);
  if (hit) {
    // Re-inserting marks it as the most recently used.
    cache.delete(rutaStorage);
    cache.set(rutaStorage, hit);
    return hit;
  }

  if (!inflight.has(rutaStorage)) {
    const download = getObjectBuffer(rutaStorage)
      .then(extractBuild)
      .then(build => { remember(rutaStorage, build); return build; })
      .finally(() => inflight.delete(rutaStorage));
    inflight.set(rutaStorage, download);
  }
  return inflight.get(rutaStorage);
};

/** Drop a build, e.g. when its .zip is deleted from the bucket. */
const forgetBuild = (rutaStorage) => {
  const build = cache.get(rutaStorage);
  if (!build) return;
  cache.delete(rutaStorage);
  cachedBytes -= build.bytes;
};

/**
 * Find a file of the build by the requested path, relative to the build root.
 * @returns {{ name: string, data: Buffer } | null}
 */
const findFile = (build, requested) => {
  const clean = requested.replace(/^\/+/, '');
  const candidates = [clean];
  if (build.root && !clean.startsWith(build.root)) candidates.unshift(`${build.root}${clean}`);

  for (const name of candidates) {
    if (build.files.has(name)) return { name, data: build.files.get(name) };
  }
  return null;
};

/**
 * Script injected into the game's index.html to report the loading progress to
 * the Gameploy player, the page that embeds the game in an iframe.
 *
 * Unity templates load the loader with a <script> and call
 * `createUnityInstance` from its onload handler. A capture-phase `load`
 * listener runs right before that handler, so it wraps the function there and
 * forwards the progress with postMessage. Outside an iframe it does nothing.
 */
const PROGRESS_REPORTER = `<script>
(function () {
  if (window.parent === window) return;
  function post(msg) {
    msg.source = 'gameploy-player';
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  function wrap() {
    var original = window.createUnityInstance;
    if (typeof original !== 'function' || original.__gameploy) return;
    var wrapped = function (canvas, config, onProgress) {
      post({ type: 'progress', value: 0 });
      return original.call(this, canvas, config, function (value) {
        post({ type: 'progress', value: value });
        if (typeof onProgress === 'function') onProgress(value);
      }).then(function (instance) {
        post({ type: 'ready' });
        return instance;
      }, function (error) {
        post({ type: 'error', message: String((error && error.message) || error) });
        throw error;
      });
    };
    wrapped.__gameploy = true;
    window.createUnityInstance = wrapped;
  }
  document.addEventListener('load', function (event) {
    if (event.target && event.target.tagName === 'SCRIPT') wrap();
  }, true);
  post({ type: 'boot' });
})();
</script>`;

/** Insert the progress script at the start of <head>, or of the document. */
const injectProgressReporter = (html) => {
  const head = html.match(/<head[^>]*>/i);
  if (!head) return PROGRESS_REPORTER + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + PROGRESS_REPORTER + html.slice(at);
};

const isEntryPage = (build, name) => name === `${build.root}index.html`;

const _resetForTests = () => {
  cache.clear();
  inflight.clear();
  cachedBytes = 0;
};

module.exports = {
  SERVE_REVISION,
  extractBuild,
  describeBuild,
  loadBuild,
  forgetBuild,
  findFile,
  findRoot,
  contentTypeFor,
  injectProgressReporter,
  isEntryPage,
  _resetForTests,
};
