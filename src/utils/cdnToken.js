const crypto = require('crypto');

/**
 * Signed links to the files served by the CDN Worker (cdn-worker/):
 *
 *   <CDN_URL>/t/<exp>.<signature>/<prefix><file>
 *
 * signature = HMAC-SHA256(secret, "<prefix>|<exp>"), base64url. The prefix is
 * the folder of one build or one image (builds/<id>/ or media/<id>/), so a link
 * opens that game or image and nothing else. The token travels in the path, so
 * the relative URLs inside a game (Build/x.wasm, TemplateData/...) inherit it.
 *
 * The Worker verifies the same format with WebCrypto (cdn-worker/src/token.js);
 * cdn-worker/test checks both sides stay compatible.
 */

const ROOTS = new Set(['builds', 'media']);

const signature = (secret, prefix, exp) =>
  crypto.createHmac('sha256', secret).update(`${prefix}|${exp}`).digest('base64url');

/**
 * Expiry (unix seconds) of the links issued now: the end of the next time
 * window. Everyone who gets a link within the same window gets the same URL,
 * so browsers can reuse their cached copy, and a leaked link stops working
 * within two windows.
 */
const tokenExpiry = (nowMs = Date.now(), windowMinutes = Number(process.env.CDN_TOKEN_TTL_MIN) || 60) => {
  const step = windowMinutes * 60;
  return (Math.floor(nowMs / 1000 / step) + 2) * step;
};

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/**
 * @param {object} options
 * @param {string} options.baseUrl CDN base URL, without trailing slash
 * @param {string} options.secret
 * @param {string} options.prefix 'builds/<id>/' or 'media/<id>/'
 * @param {string} options.file path inside the prefix
 */
const signedUrl = ({ baseUrl, secret, prefix, file, nowMs = Date.now() }) => {
  const exp = tokenExpiry(nowMs);
  return `${baseUrl}/t/${exp}.${signature(secret, prefix, exp)}/${encodePath(prefix + file)}`;
};

/**
 * Split a CDN path into token, signed prefix and object key, as the Worker does.
 * @returns {{ exp: number, signature: string, prefix: string, key: string } | null}
 */
const parsePath = (pathname) => {
  const parts = pathname.split('/').slice(1);
  if (parts.length < 5 || parts[0] !== 't') return null;

  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(parts[1]);
  if (!match) return null;

  let segments;
  try {
    segments = parts.slice(2).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (!ROOTS.has(segments[0]) || !segments[1]) return null;
  if (segments.some(s => s === '' || s === '.' || s === '..')) return null;

  return {
    exp: Number(match[1]),
    signature: match[2],
    prefix: `${segments[0]}/${segments[1]}/`,
    key: segments.join('/'),
  };
};

/** Whether a parsed path carries a valid, unexpired signature. */
const verify = (secret, { prefix, exp, signature: given }, nowMs = Date.now()) => {
  if (!secret || exp * 1000 <= nowMs) return false;
  const expected = Buffer.from(signature(secret, prefix, exp));
  const actual = Buffer.from(given);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

module.exports = { signature, tokenExpiry, signedUrl, parsePath, verify };
