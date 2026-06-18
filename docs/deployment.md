# Deployment and reverse proxies

ExcaliDash exposes only the frontend service to users. The frontend Nginx
serves the application and proxies `/api/` and `/socket.io/` to the backend.
External gateways should therefore route traffic to the frontend, not directly
to the backend.

## Common configuration

Copy the Compose environment example and adjust it:

```bash
cp .env.example .env
docker compose config
docker compose up --build -d
```

For direct local access at `http://localhost:6767`, keep:

```env
FRONTEND_URL=http://localhost:6767
TRUST_PROXY=false
ENFORCE_HTTPS_REDIRECT=false
```

For a public HTTPS origin behind a trusted external proxy, use:

```env
FRONTEND_URL=https://excalidash.example.com
TRUST_PROXY=1
ENFORCE_HTTPS_REDIRECT=false
```

`TRUST_PROXY=1` trusts the frontend Nginx hop that normalizes forwarded
headers. Do not enable proxy trust when clients can reach the backend directly.
Keep `ENFORCE_HTTPS_REDIRECT=false` when the external gateway already redirects
HTTP to HTTPS; this prevents redirect loops caused by incomplete forwarded
headers.

The effective upload ceiling is the smallest limit in the request path:

- external gateway or tunnel limit;
- `NGINX_CLIENT_MAX_BODY_SIZE`;
- `MAX_UPLOAD_MB` for multipart backup/database uploads;
- `MAX_JSON_BODY_MB` for individual drawing JSON imports;
- import-specific extracted-content limits.

After changing limits, recreate both services:

```bash
docker compose up -d --force-recreate backend frontend
```

## Database (PostgreSQL)

ExcaliDash is PostgreSQL-only. The backend connects via `DATABASE_URL`, in the
canonical form:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
```

In Docker Compose the DB host is the `postgres` service name; for a host-run dev
backend it is `localhost`.

### Local PostgreSQL (bundled compose `postgres` service)

The Compose files include a bundled `postgres` service. Set the `POSTGRES_*`
values and `DATABASE_URL` in `.env`, then bring the stack up:

```env
POSTGRES_DB=excalidash
POSTGRES_USER=excalidash
POSTGRES_PASSWORD=change_me_strong_password
DATABASE_URL=postgresql://excalidash:change_me_strong_password@postgres:5432/excalidash?schema=public
```

```bash
docker compose up -d
```

The backend's `DATABASE_URL` must point at the `postgres` service
(`@postgres:5432`) and use the same credentials/database name as the
`POSTGRES_*` values above.

### External / managed PostgreSQL

To use an external or managed PostgreSQL (RDS, Cloud SQL, a separate server,
etc.), set `DATABASE_URL` to that instance and remove or ignore the bundled
`postgres` service:

```env
DATABASE_URL=postgresql://USER:PASSWORD@db.example.com:5432/excalidash?schema=public
```

When using an external database you do not need the bundled `postgres` service
or its `POSTGRES_*` variables; point only `DATABASE_URL` at the managed
instance.

### Applying migrations on deploy

Migrations are applied with `prisma migrate deploy`. The backend entrypoint runs
this automatically on startup when `RUN_MIGRATIONS=true` (the default), so a
normal `docker compose up -d` brings the schema up to date against whatever
`DATABASE_URL` points at.

### Changing the password or database name

Update the `POSTGRES_*` values and `DATABASE_URL` **together** — the user,
password, and database name in `DATABASE_URL` must match the `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB` of the running PostgreSQL. Changing one
without the other will cause the backend to fail to connect.

### Resetting the local environment

To reset the local environment, remove the `postgres_data` volume. With the
bundled `postgres` service, `docker compose down -v` drops the `postgres_data`
named volume (and other named volumes), permanently deleting local database
data:

```bash
docker compose down -v
```

### Unchanged by the PostgreSQL migration

The PostgreSQL migration does **not** change the large-upload settings or any of
the reverse-proxy behavior described in this document. `MAX_UPLOAD_MB`,
`NGINX_CLIENT_MAX_BODY_SIZE`, the HTTP 413 (`PAYLOAD_TOO_LARGE`) behavior, and
all reverse-proxy sections below (External Nginx, Caddy, Traefik, Cloudflare
Tunnel, and the Coolify/Easypanel/Dokploy panels) remain exactly as documented.

## Library cache (curated packs)

The curated Excalidraw library packs store metadata in PostgreSQL and cache
downloaded `.excalidrawlib` files on disk under `LIBRARY_CACHE_DIR` (default
`/app/data/libraries`). The bundled `docker-compose.yml` mounts a named
`library-data` volume at `/app/data` so the cache survives restarts; it is
dropped by `docker compose down -v` along with the other named volumes.

Outbound network egress to `raw.githubusercontent.com` is required for the
catalog refresh and for caching libraries. The host allowlist is hard-coded
(only the official Excalidraw catalog path over HTTPS), so no other destinations
are reachable regardless of the env values. To run fully offline, set
`LIBRARY_AUTO_REFRESH_ON_START=false`; the curated pack rows are still created,
they just have no resolved members until a successful `POST /api/libraries/refresh`.

Relevant variables (see also `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `LIBRARY_CACHE_DIR` | `/app/data/libraries` | where cached `.excalidrawlib` files are written |
| `LIBRARY_DOWNLOAD_MAX_MB` | `25` | per-file download size cap |
| `LIBRARY_DOWNLOAD_TIMEOUT_MS` | `15000` | per-request timeout |
| `LIBRARY_PUBLIC_SEARCH_ENABLED` | `true` | enable/disable PUBLIC_SEARCH |
| `LIBRARY_PUBLIC_SEARCH_MAX_RESULTS` | `25` | cap on public results |
| `LIBRARY_REFRESH_INTERVAL_HOURS` | `24` | advisory refresh cadence |
| `LIBRARY_AUTO_REFRESH_ON_START` | `true` | refresh catalog + reseed on startup |
| `EXCALIDRAW_LIBRARIES_CATALOG_URL` | official catalog | catalog JSON URL (allowlisted host only) |
| `EXCALIDRAW_LIBRARIES_BASE_URL` | official base | library file base URL (allowlisted host only) |

## MCP server (`/mcp`)

The MCP endpoint is mounted at `/mcp` and authenticated by Bearer `exd_` API
keys. It exposes 25 tools and 25 prompts; 25 Claude Code skills install
separately (`packages/excalidash-claude-skills`). Full reference and
troubleshooting: [docs/mcp.md](mcp.md) and [docs/skills.md](skills.md).

| Env var | Default | Notes |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | turn the endpoint on/off |
| `MCP_ENDPOINT_PATH` | `/mcp` | endpoint path |
| `MCP_MIN_DRAWING_SCORE` | `95` | passing bar before saving as final |
| `MCP_MAX_REPAIR_ATTEMPTS` | `5` | auto-polish loop cap |
| `MCP_ALLOW_LOW_SCORE_DRAFT` | `true` | allow explicit below-bar drafts |
| `MCP_MAX_ELEMENTS` | `5000` | max elements per scene |
| `MCP_MAX_EXPORT_MB` | `100` | export size cap |
| `MCP_DEFAULT_LIBRARY_MODE` | `curated` | which packs search returns |
| `MCP_LIBRARY_MODE` | `curated` | `off`/`curated`/`required` usage enforcement |
| `MCP_PUBLIC_SEARCH_ENABLED` | `false` | allow PUBLIC catalog search |
| `MCP_RATE_LIMIT_MAX` / `MCP_RATE_LIMIT_WINDOW_SECONDS` | `300` / `900` | dedicated rate limit |
| `MCP_VALIDATE_ORIGIN` | `true` | validate the `Origin` header for browser clients |

Reverse-proxy notes: route `/mcp` to the **backend** (not the SPA) so clients
don't receive HTML; it uses `POST` (a `GET` returns 405) and is exempt from
cookie-CSRF (it is Bearer-authenticated, not cookie-authenticated).

## External Nginx

```nginx
server {
  server_name excalidash.example.com;

  client_max_body_size 250M;

  location / {
    proxy_pass http://127.0.0.1:6767;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:6767/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

Terminate TLS in the external Nginx and route both normal traffic and
`/socket.io/` to port `6767`.

## Caddy

```caddyfile
excalidash.example.com {
  request_body {
    max_size 250MB
  }
  reverse_proxy 127.0.0.1:6767
}
```

Caddy handles WebSocket upgrades automatically. The public origin still needs
to be configured in `FRONTEND_URL`.

## Traefik

Traefik is optional. The base Compose files do not contain or require Traefik
labels. If the frontend service shares a network with Traefik, labels can be
added in a local override:

```yaml
services:
  frontend:
    labels:
      - traefik.enable=true
      - traefik.http.routers.excalidash.rule=Host(`excalidash.example.com`)
      - traefik.http.routers.excalidash.entrypoints=websecure
      - traefik.http.routers.excalidash.tls.certresolver=letsencrypt
      - traefik.http.services.excalidash.loadbalancer.server.port=80
```

Traefik supports WebSocket upgrades without a separate Socket.IO router. If a
buffering/body-size middleware is enabled globally, ensure its limit is at
least as large as `NGINX_CLIENT_MAX_BODY_SIZE`.

## Cloudflare Tunnel

Point the tunnel at the frontend service or published frontend port:

```yaml
ingress:
  - hostname: excalidash.example.com
    service: http://localhost:6767
  - service: http_status:404
```

Cloudflare Tunnel supports WebSockets. Configure the same public hostname in
`FRONTEND_URL`, set `TRUST_PROXY=1`, and keep
`ENFORCE_HTTPS_REDIRECT=false`. Cloudflare account/product request-size limits
still apply and cannot be raised by ExcaliDash.

## Coolify, Easypanel, and Dokploy

Deploy both Compose services and expose only the frontend service on container
port `80`. Configure the platform domain/TLS proxy to target that port.

Set these variables in the panel:

```env
FRONTEND_URL=https://excalidash.example.com
TRUST_PROXY=1
ENFORCE_HTTPS_REDIRECT=false
BACKEND_URL=backend:8000
NGINX_CLIENT_MAX_BODY_SIZE=250M
```

Do not expose backend port `8000` publicly. If the platform has its own upload
limit or proxy timeout controls, align them with the Nginx and backend values.
No platform-specific labels are required by the base Compose files.

## Large upload verification

Generate a valid large drawing fixture:

```bash
node scripts/generate-large-excalidraw.cjs \
  --size-mb 35 \
  --output /tmp/excalidash-large-35mb.excalidraw
```

Then use the dashboard **Import** action to upload that file. This exercises the
real individual drawing path: browser file parsing, preview generation, the
frontend Nginx `/api/` proxy, Express JSON parsing, validation, and persistence.

For backup imports, use **Settings → Advanced / Legacy → Import Backup**. A
multipart backup must fit under both `NGINX_CLIENT_MAX_BODY_SIZE` and
`MAX_UPLOAD_MB`; each extracted drawing and the total extracted data are also
checked independently.

When a configured limit is exceeded, the backend returns HTTP 413:

```json
{
  "error": "Payload too large",
  "message": "The uploaded file exceeds the configured limit.",
  "limitMb": 250,
  "code": "PAYLOAD_TOO_LARGE"
}
```
