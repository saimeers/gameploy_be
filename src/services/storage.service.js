const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { storageClient, BUCKET_NAME } = require('../config/storage');

/**
 * Upload a file buffer to Railway bucket.
 * @param {object} options
 * @param {Buffer} options.buffer
 * @param {string} options.key - Storage path, e.g. "projects/uuid/v1/game.zip"
 * @param {string} options.mimetype
 * @returns {Promise<string>} public URL or storage key
 */
const uploadFile = async ({ buffer, key, mimetype }) => {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  });

  await storageClient.send(command);
  return key;
};

/**
 * Delete a file from Railway bucket.
 * @param {string} key
 */
const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  await storageClient.send(command);
};

/**
 * Generate a pre-signed URL to access a private file.
 * @param {string} key
 * @param {number} expiresIn - seconds (default 1 hour)
 * @returns {Promise<string>}
 */
const getPresignedUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
  return getSignedUrl(storageClient, command, { expiresIn });
};

/**
 * Build a storage key for a project file.
 * @param {string} projectId
 * @param {string} versionId
 * @param {string} filename
 * @returns {string}
 */
const buildStorageKey = (projectId, versionId, filename) => {
  return `projects/${projectId}/versions/${versionId}/${filename}`;
};

module.exports = { uploadFile, deleteFile, getPresignedUrl, buildStorageKey };