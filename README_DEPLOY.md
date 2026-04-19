# AOG Sentinel Deploy Guide

This repository is prepared for a Render deployment with four services defined in `/Users/ssg/Desktop/AOG Sentinel/render.yaml`:

- `aog-sentinel-frontend` — Next.js web service
- `aog-sentinel-backend` — FastAPI web service
- `aog-sentinel-connector-worker` — connector worker
- `aog-sentinel-postgres` — Render PostgreSQL database

## Service model

- Frontend: Docker-based Render Web Service
- Backend: Docker-based Render Web Service
- Worker: Docker-based Render Background Worker
- Database: Render PostgreSQL

`backend/data` is baked into the backend image and used as read-only runtime data. Current runtime state is stored in PostgreSQL and browser `localStorage`; no persistent disk is required for the current deployment shape.

## Production environment variables

### Frontend

Required:

- `NEXT_PUBLIC_API_BASE_URL=https://<backend-service>.onrender.com`

Optional:

- `NEXT_PUBLIC_FLIGHTS_MAP_STYLE_URL`
- `NEXT_PUBLIC_FLIGHTS_3D_TILE_URL`

### Backend

Required:

- `AOG_ENV=production`
- `AOG_DATABASE_URL` (from Render PostgreSQL)
- `AOG_ALLOWED_ORIGINS=https://<frontend-service>.onrender.com`
- `AOG_JWT_SECRET_KEY=<strong-random-secret>`
- `AOG_BOOTSTRAP_DEFAULT_PASSWORD=<strong-initial-password>`

Optional:

- `AOG_ALLOWED_ORIGIN_REGEX`
- `AOG_SQL_ECHO`
- `AOG_ENABLE_API_DOCS`
- `AOG_AUTH_LOGIN_WINDOW_SECONDS`
- `AOG_AUTH_LOGIN_MAX_ATTEMPTS`
- `AOG_AUTH_LOGIN_BLOCK_SECONDS`
- `AOG_BOOTSTRAP_PLATFORM_DATA`
- `AOG_BOOTSTRAP_ADMIN_EMAIL`
- `AOG_BOOTSTRAP_ADMIN_NAME`
- `AOG_DOC_MODEL`
- `AOG_DOCS_FORCE_FALLBACK`
- `OPENSKY_USERNAME`
- `OPENSKY_PASSWORD`
- `FLIGHTS_CACHE_TTL_SECONDS`
- `FLIGHTS_DEFAULT_LIMIT`
- `WEATHER_CACHE_TTL_SECONDS`
- `AOG_CONNECTOR_WORKER_POLL_SECONDS`
- `AOG_CONNECTOR_SYNC_INLINE`

### Worker

Required:

- `AOG_ENV=production`
- `AOG_DATABASE_URL` (from Render PostgreSQL)
- `AOG_JWT_SECRET_KEY=<same-backend-secret>`
- `AOG_BOOTSTRAP_DEFAULT_PASSWORD=<same-bootstrap-password>` when bootstrap remains enabled

The worker shares the backend runtime configuration except for browser-facing CORS settings.

## Exact commands used by Render

### Frontend

- Docker context: `./frontend`
- Dockerfile: `./frontend/Dockerfile`
- Build inside image: `npm run build`
- Start inside image: `node server.js`
- Health check: `/api/health`

### Backend

- Docker context: `./backend`
- Dockerfile: `./backend/Dockerfile`
- Pre-deploy migration: `python -m alembic upgrade head`
- Start inside image: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT}`
- Health check: `/health`

### Worker

- Docker context: `./backend`
- Dockerfile: `./backend/Dockerfile`
- Command: `python -m app.workers.connector_worker`

## Health endpoints

- Frontend: `/api/health`
- Backend: `/health`

## Bootstrap and production safety

- In production, backend startup fails if `AOG_JWT_SECRET_KEY` is missing or left at the insecure default.
- In production, backend startup also fails if `AOG_BOOTSTRAP_PLATFORM_DATA=true` and `AOG_BOOTSTRAP_DEFAULT_PASSWORD` is missing or left at the insecure default.
- Local development keeps the existing fallback behavior because `AOG_ENV` defaults to `development`.

## GitHub -> Render steps

1. Push `/Users/ssg/Desktop/AOG Sentinel` to GitHub.
2. In Render, create a new Blueprint from that repository.
3. Confirm Render detects `/Users/ssg/Desktop/AOG Sentinel/render.yaml`.
4. Let Render provision:
   - `aog-sentinel-frontend`
   - `aog-sentinel-backend`
   - `aog-sentinel-connector-worker`
   - `aog-sentinel-postgres`
5. Before the first deploy, set these manual environment variables:
   - frontend `NEXT_PUBLIC_API_BASE_URL`
   - backend `AOG_ALLOWED_ORIGINS`
   - backend `AOG_JWT_SECRET_KEY`
   - worker `AOG_JWT_SECRET_KEY`
   - backend `AOG_BOOTSTRAP_DEFAULT_PASSWORD`
   - worker `AOG_BOOTSTRAP_DEFAULT_PASSWORD` if bootstrap remains enabled
   - optional backend/worker `OPENSKY_USERNAME`
   - optional backend/worker `OPENSKY_PASSWORD`
6. Deploy the Blueprint.
7. Confirm backend migration succeeds through Render pre-deploy.
8. Verify:
   - `https://<frontend-service>.onrender.com/api/health`
   - `https://<backend-service>.onrender.com/health`
   - frontend login page
9. Sign in with the bootstrap admin email from `AOG_BOOTSTRAP_ADMIN_EMAIL` and the password you set in `AOG_BOOTSTRAP_DEFAULT_PASSWORD`.
10. After the first successful bootstrap, optionally set `AOG_BOOTSTRAP_PLATFORM_DATA=false` on backend and worker to prevent repeated bootstrap writes on future restarts.

## Read-only image data

The backend image bakes in:

- `/Users/ssg/Desktop/AOG Sentinel/backend/data`
- CSV seed datasets
- manual chunks and document files
- reference mappings
- the default sentence-transformer model baked during Docker build

The current code reads those assets at runtime and stores mutable state in PostgreSQL.
