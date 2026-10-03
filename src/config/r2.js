const { S3Client } = require('@aws-sdk/client-s3');

let client = null;

/** S3 client for Cloudflare R2, created on first use. */
const getR2Client = () => {
  client ??= new S3Client({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
};

module.exports = { getR2Client };
