const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { getRedis } = require('../config/redis');
const { RedisRateLimitStore } = require('../utils/rateLimitStore');
const { clientIp } = require('../utils/clientIp');

/**
 * Rate limiter per visitor (see utils/clientIp.js: behind Cloudflare, the
 * visitor's IP, not Cloudflare's). Counters live in Redis when available, so
 * they survive deploys; if Redis fails, requests go through rather than the
 * API going down.
 * @param {string} prefix Redis key prefix, e.g. 'rl:global:'
 * @param {import('express-rate-limit').Options} options
 */
const createLimiter = (prefix, options) => {
  const redis = getRedis();
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
    ...(redis && { store: new RedisRateLimitStore(redis, prefix) }),
    ...options,
  });
};

module.exports = { createLimiter };
