/**
 * Largest file a project upload may have.
 *
 * The API is behind Cloudflare's proxy, which on the free plan rejects any
 * request over 100 MB with a 413 before it reaches the server. That size
 * counts the whole multipart request and may be decimal (100 000 000 bytes),
 * so files are capped at 95 MB: anything accepted here gets through Cloudflare.
 *
 * The frontend checks the same value (gameploy_fe: src/lib/limits.js,
 * archivoMaxMB); change both together. UPLOAD_MAX_MB is only for tests.
 */
const MAX_UPLOAD_MB = Number(process.env.UPLOAD_MAX_MB) || 95;
const MAX_UPLOAD_BYTES = Math.floor(MAX_UPLOAD_MB * 1024 * 1024);

/** Room for the multipart boundaries and the other form fields. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

module.exports = { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, FORM_OVERHEAD_BYTES };
