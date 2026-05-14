const { S3Client } = require('@aws-sdk/client-s3');

const storageClient = new S3Client({
  endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
  region: process.env.RAILWAY_BUCKET_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.RAILWAY_BUCKET_NAME;

module.exports = { storageClient, BUCKET_NAME };