require('dotenv').config();

BigInt.prototype.toJSON = function () {
  return this.toString();
};

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const routes = require('./routes');
const { AppError } = require('./utils/errors');
const { error: errorResponse } = require('./utils/response');
const { createLimiter } = require('./middlewares/rateLimit.middleware');

const app = express();

app.set('trust proxy', 1);

// ── Security headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
    frameguard: false,
  })
);

// ── CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting (auth endpoints tighter); see middlewares/rateLimit.middleware.js
const globalLimiter = createLimiter('rl:global:', {
  windowMs: 15 * 60 * 1000, // 15 min
  // A classroom shares one public IP; with games and images served by the
  // CDN, a game page costs about one API request.
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
  // Legacy game files and the dev CDN are static: one game boot is ~10
  // requests and must not count against the limit.
  skip: (req) => req.path.startsWith('/api/v1/play/') || req.path.startsWith('/api/v1/cdn/'),
});

const authLimiter = createLimiter('rl:auth:', {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many requests from this IP, please try again later.',
});

app.use(globalLimiter);
app.use('/api/v1/auth', authLimiter);

// ── Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── API routes
app.use('/api/v1', routes);

// ── Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── 404 handler
app.use((_req, res) => {
  errorResponse(res, { message: 'Route not found', statusCode: 404 });
});

// ── Global error handler
app.use((err, _req, res, _next) => {
  if (err.isOperational) {
    return errorResponse(res, { message: err.message, statusCode: err.statusCode });
  }
  console.error('Unexpected error:', err);
  errorResponse(res, { message: 'Internal server error', statusCode: 500 });
});

module.exports = app;