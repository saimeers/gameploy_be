# Gameploy — Backend API

REST API for **Gameploy**, a web platform for deploying and managing Serious Games developed at Semillero VIRAL.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express.js |
| ORM | Prisma |
| Database | PostgreSQL (Railway) |
| Auth | Firebase Admin SDK (email/password + Google) |
| Storage | Railway Bucket (S3-compatible) |
| Email | Resend |
| Docs | Swagger / OpenAPI 3.0 |

## Getting started

```bash
# 1. Clone and install
git clone https://github.com/saimeers/gameploy_be.git
cd gameploy_be
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your values in .env

# 3. Run database migrations
npm run db:migrate

# 4. Seed initial data (roles + categories)
npm run db:seed

# 5. Start development server
npm run dev
```

## API Documentation

Once the server is running, visit:

```
http://localhost:3000/api/docs
```

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run start` | Production server |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed roles and categories |

## Environment variables

See `.env.example` for all required variables.

## Project structure

```
src/
├── config/        # Firebase, Storage, Swagger setup
├── controllers/   # Request handlers
├── middlewares/   # Auth and RBAC
├── routes/        # Express routers with Swagger docs
├── services/      # Business logic
├── utils/         # Helpers (response, errors, slug)
└── app.js         # Express app
prisma/
├── schema.prisma  # Data model
└── seed.js        # Initial data
server.js          # Entry point
```

## API base path

```
/api/v1
```

## Authentication

All protected endpoints require a Firebase ID token in the `Authorization` header:

```
Authorization: Bearer <firebase_id_token>
```