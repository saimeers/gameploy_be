const path = require('path');

/**
 * Where published game builds and images live and how links to them are built.
 *
 * - r2: Cloudflare R2 (R2_BUCKET set), served by the CDN Worker at CDN_URL.
 * - local: a folder on disk served by this API at /api/v1/cdn, with the same
 *   signed links, so development and tests need no Cloudflare account.
 * - none: production without R2. Nothing is published; images get presigned
 *   URLs from the main bucket and games fall back to /play.
 *
 * Read on every call so tests can change the environment.
 */
const getPublicFilesConfig = () => {
  const port = process.env.PORT || 3000;
  const apiPublicUrl = (process.env.API_PUBLIC_URL || `http://localhost:${port}/api/v1`).replace(/\/+$/, '');

  let driver = process.env.R2_BUCKET ? 'r2' : process.env.NODE_ENV === 'production' ? 'none' : 'local';
  const cdnUrl = (process.env.CDN_URL || (driver === 'local' ? `${apiPublicUrl}/cdn` : '')).replace(/\/+$/, '');
  const signingSecret = process.env.CDN_SIGNING_SECRET || (driver === 'local' ? 'gameploy-local-dev-secret' : '');

  if (driver === 'r2' && (!cdnUrl || !signingSecret)) {
    console.error('R2_BUCKET is set but CDN_URL or CDN_SIGNING_SECRET is missing: files will not be published');
    driver = 'none';
  }

  return {
    driver,
    enabled: driver !== 'none',
    cdnUrl,
    signingSecret,
    localDir: process.env.PUBLIC_FILES_DIR || path.join(process.cwd(), '.public-files'),
    bucket: process.env.R2_BUCKET,
  };
};

module.exports = { getPublicFilesConfig };
