# KINOSOTA — Canonical Frontend

User UI (`frontend/`) and Admin UI (`admin-frontend/`) of KINOSOTA, plus the
control-plane Nginx that serves both and proxies the Backend API.

This repository is one of three canonical repositories and is never merged with them:

| Repository | Role |
|---|---|
| `kinomap/Canonical-Backend` | API, ingest, identity, catalog, WireGuard controller, docker-compose |
| `kinomap/Canonical-Frontend` | this repo: User UI, Admin UI, `nginx.conf`, `Dockerfile.frontend` |
| `kinomap/node` | Media Node |

## Layout

```
frontend/              User UI (Vue 3 + Vite), served at /
admin-frontend/        Admin UI (Vue 3 + Vite, base /admin/), served at /admin/
nginx.conf             control-plane Nginx (SPA routing, /api/, /media/, internal API WireGuard-only)
Dockerfile.frontend    builds both UIs and the Nginx image
tests/                 pytest contract tests for nginx.conf
```

## Build the image (how KINOSOTA uses it)

The Backend `docker-compose.yml` builds this repository as the `frontend` service:

```
build:
  context: ${KINOSOTA_FRONTEND_DIR:-../Canonical-Frontend}
  dockerfile: Dockerfile.frontend
```

Check out both repositories side by side (`Canonical-Backend/` and `Canonical-Frontend/`)
or set `KINOSOTA_FRONTEND_DIR` to this checkout. Published ports are defined by the Backend
compose (`127.0.0.1:8888` and the WireGuard address `10.8.0.1:8888`); the Backend `:8000`
and PostgreSQL `:5432` are never published, all API traffic goes through this Nginx.

Standalone image build from a clean tree:

```
git archive HEAD | tar -x -C /tmp/fe-clean
docker build -f /tmp/fe-clean/Dockerfile.frontend -t kinosota-frontend:<commit> /tmp/fe-clean
```

## Configuration

See `.env.example`. The only build-time variable is `VITE_API_BASE_URL`
(User UI; default `/api/v1`, i.e. same origin through Nginx). No secrets are used or
needed by the frontend.

## Development

Requires Node.js 20+. Both dev servers proxy `/api` and `/media` to the local
KINOSOTA Nginx on `127.0.0.1:8888` (the Backend `:8000` is private).

```
cd frontend && npm ci && npm run dev              # http://127.0.0.1:5173
cd admin-frontend && npm ci && npm run dev        # http://127.0.0.1:5174/admin/
```

## Checks

```
cd admin-frontend && npx vue-tsc --noEmit && npm test && npm run build
cd frontend && npm run build && npm test
python -m pytest -q tests                         # nginx.conf contract (nginx -t needs Docker)
```

## API contract

The UIs consume the Backend API under `/api/v1`. The contract (schemas, admin
endpoints, catalog rules) is owned and documented by `Canonical-Backend`; a release
records the Frontend commit together with the Backend commit and API version it was
verified against.
