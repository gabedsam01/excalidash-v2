<img src="readme-assets/logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

![](readme-assets/demo.gif)

## Table of Contents

- [Features](#features)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Quickstart](#quickstart)
  - [Advanced](#advanced)
- [Deployment and reverse proxies](#deployment-and-reverse-proxies)
- [API Keys for MCP clients](#api-keys-for-mcp-clients)
- [ExcaliDash MCP Server](#excalidash-mcp-server)
- [Development](#development)
- [Credits](#credits)

## Features

<details>
<summary>Persistent storage for all your drawings</summary>

![](readme-assets/dashboard.png)

</details>

<details>
<summary>Real time collaboration</summary>

![](readme-assets/collabDemo.gif)

</details>

<details>
<summary>Version history and restore</summary>

Automatically retain recent drawing snapshots, preview past versions from the editor, and restore a previous state when needed.

</details>

<details>
<summary>(Optional) Multi User Authentication, OIDC Support</summary>

### Sign in with OIDC

![](readme-assets/signInOIDC.png)

### Migration from v0.3

![](readme-assets/migrationScreen.png)

### Admin Bootstrap

![](readme-assets/adminBootstrap.png)

### Admin Dashboard

![](readme-assets/adminDashboard.png)

</details>

<details>
<summary>Scoped internal & external sharing</summary>

![](readme-assets/scoped.png)

</details>
<details>
<summary>Search your drawings</summary>

![](readme-assets/search.gif)

</details>

<details>
<summary>Drag and drop drawings into collections</summary>

![](readme-assets/collections.gif)

</details>

<details>
<summary>Export/import your drawings for backup</summary>

### Excalidash uses a non-proprietary archival format that stores your drawings in plain .excalidraw format

![](readme-assets/backupsImport.gif)

</details>

# Upgrading

See [release notes](https://github.com/ZimengXiong/ExcaliDash/releases) for a specific release.

ExcaliDash includes an in-app update notifier that checks GitHub Releases. If your deployment must not make outbound network calls, disable it on the backend:

```bash
UPDATE_CHECK_OUTBOUND=false
```

## Docker Hub Upgrades

If you deployed using `docker-compose.prod.yml` (Docker Hub images), upgrade by pulling the latest images and recreating containers:

```bash
docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

If you prefer a clean stop/start (more downtime, but simpler), you can do:

```bash
docker compose -f docker-compose.prod.yml down && \
  docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

Notes:

- Don’t add `-v` to `down` unless you intend to delete the persistent backend volume (your PostgreSQL data volume + backend secrets). With the bundled `postgres` service, `docker compose down -v` also drops the `postgres_data` named volume.
- Only add `--remove-orphans` if you previously ran a different Compose file for the same project name and need to remove old/renamed services.

# Installation

> [!CAUTION]
> This is a BETA deployment and production-readiness depends on deployment controls:
> use TLS, trusted reverse proxy, fixed secrets, backups, and endpoint rate limits.

> [!CAUTION]
> ExcaliDash is in BETA. Please backup your data regularly.

## Quickstart

Prereqs: Docker + Docker Compose v2.

For a repository checkout, start from the generic environment example:

```bash
cp .env.example .env
docker compose config
```

<details>
<summary>Docker Hub (Recommended)</summary>

## Docker Hub (Recommended)

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/main/docker-compose.prod.yml

# Pull images
docker compose -f docker-compose.prod.yml pull

# Run container
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at localhost:6767
```

For single-container deployments, `JWT_SECRET`, `CSRF_SECRET`, and
`API_KEY_SECRET` can be omitted and will be auto-generated and persisted in the
backend volume on first start. For portability, backups, and multi-instance
deployments, set fixed secrets explicitly.

By default, the provided Compose files set `TRUST_PROXY=false` for safer setup. Only set `TRUST_PROXY` to a positive hop count (for example, `1`) when requests always pass through a trusted reverse proxy that correctly sets forwarded headers.

</details>

<details>
<summary>Docker Build</summary>

## Docker Build

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git

docker compose build
docker compose up -d

# Access the frontend at localhost:6767
```

</details>

## Advanced

<details>
<summary>Reverse Proxy / Traefik</summary>

When running ExcaliDash behind Traefik, Nginx, or another reverse proxy, configure both containers so that API + WebSocket calls resolve correctly:

| Variable                 | Purpose                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_URL`           | Backend allowed origin(s). Must match the public URL users access (for example `https://excalidash.example.com`). Supports comma-separated values for multiple addresses. |
| `TRUST_PROXY`            | Set to `1` when traffic passes through one trusted reverse-proxy hop (for example frontend nginx -> backend) and headers are sanitized.                                   |
| `BACKEND_URL`            | Frontend container-to-backend target used by Nginx. Override when backend host differs from default service DNS/host.                                                     |
| `ENFORCE_HTTPS_REDIRECT` | When `FRONTEND_URL` uses `https://`, the backend automatically redirects plain-HTTP requests to HTTPS. Set to `false` if your outer gateway already enforces HTTPS and you want to disable the built-in redirect (avoids redirect loops when `X-Forwarded-Proto` is not forwarded). Default: `true`. |

```yaml
# docker-compose.yml example
backend:
  environment:
    # Single URL
    - FRONTEND_URL=https://excalidash.example.com
    # Trust exactly one reverse-proxy hop
    - TRUST_PROXY=1
    # Or multiple URLs (comma-separated) for local + network access
    # - FRONTEND_URL=http://localhost:6767,http://192.168.1.100:6767,http://nas.local:6767
    # If your outer gateway enforces HTTPS and X-Forwarded-Proto is not forwarded,
    # disable the built-in redirect to prevent redirect loops:
    # - ENFORCE_HTTPS_REDIRECT=false
frontend:
  environment:
    # For standard Docker Compose (default)
    # - BACKEND_URL=backend:8000
    # For Kubernetes, use the service DNS name:
    - BACKEND_URL=excalidash-backend.default.svc.cluster.local:8000
```

</details>

## Deployment and reverse proxies

The base Compose files are proxy-agnostic: they contain no fixed domain,
Traefik labels, or embedded secrets. See
[docs/deployment.md](docs/deployment.md) for local access, large-upload sizing,
Nginx, Caddy, Traefik, Cloudflare Tunnel, Coolify, Easypanel, and Dokploy
examples.

<details>
<summary>Scaling / HA (Current Limitations)</summary>

ExcaliDash currently supports running **one backend instance**.

Why:

| Area          | Limitation                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | The database is now **PostgreSQL**, so multiple backend replicas can share one PostgreSQL instance (the bundled Compose `postgres` service, or an external/managed PostgreSQL). The database is no longer the single-instance limiter. |
| Collaboration | Real-time presence state is tracked **in-memory** in the backend process, so multiple replicas will fragment presence/collaboration unless a shared Socket.IO adapter is added. This in-memory Socket.IO presence/collab state is the remaining single-instance limiter, not the database.            |

Recommended deployment pattern:

| Component | Guidance                                                                |
| --------- | ----------------------------------------------------------------------- |
| Backend   | 1 replica, persistent volume, regular backups.                          |
| Frontend  | 1 replica is simplest; scaling is generally fine since it is stateless. |

</details>

<details>
<summary>Auth, Onboarding, and First Admin Setup</summary>

ExcaliDash supports local login and OIDC, and includes a one-time first-admin bootstrap key to protect initial setup/migration flows.

Auth modes:

| `AUTH_MODE`       | Behavior                                                       |
| ----------------- | -------------------------------------------------------------- |
| `local` (default) | Native email/password login only.                              |
| `hybrid`          | Native login plus OIDC login.                                  |
| `oidc_enforced`   | OIDC-only login (`/auth/register` and `/auth/login` disabled). |

If you upgrade and see an onboarding/setup flow, follow the UI. For emergency-only operator access, you can temporarily bypass the onboarding gate:

```bash
DISABLE_ONBOARDING_GATE=true docker compose -f docker-compose.prod.yml up -d
```

One-time first-admin bootstrap setup code (local auth only):

| What             | Notes                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| When required    | Auth enabled and no active users (fresh install or certain migrations).              |
| Where to find it | Backend logs: `[BOOTSTRAP SETUP] One-time admin setup code ...`.                     |
| Behavior         | Single-use; if you enter an invalid/expired code, check logs for the refreshed code. |

Find the current code in logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | grep "BOOTSTRAP SETUP"
```

OIDC configuration (for `hybrid` / `oidc_enforced`) requires these backend env vars:

```yaml
backend:
  environment:
    - AUTH_MODE=oidc_enforced
    - OIDC_PROVIDER_NAME=Authentik
    - OIDC_ISSUER_URL=https://auth.example.com/application/o/excalidash/
    # Optional split-horizon setup when backend reaches IdP via internal DNS.
    # Keep OIDC_ISSUER_URL browser-routable; set OIDC_DISCOVERY_URL for backend-only access.
    # - OIDC_DISCOVERY_URL=http://auth-internal:9000/application/o/excalidash/
    - OIDC_CLIENT_ID=your-client-id
    # Optional for public clients; required for confidential clients
    # - OIDC_CLIENT_SECRET=your-client-secret
    # Optional token endpoint auth override (useful for some IdPs/HS setups)
    # - OIDC_TOKEN_ENDPOINT_AUTH_METHOD=client_secret_post
    # Optional override when your IdP client is configured for a non-default ID token alg
    # - OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG=HS256
    - OIDC_REDIRECT_URI=https://excalidash.example.com/api/auth/oidc/callback
    - OIDC_SCOPES=openid profile email
    # Optional: path to groups/roles claim in ID token/user claims (supports dot path)
    - OIDC_GROUPS_CLAIM=groups
    # Optional: comma-separated group names that should be ADMIN in ExcaliDash
    - OIDC_ADMIN_GROUPS=excalidash-admins,platform-admins
```

Quick preflight check (recommended before starting backend):

```bash
cd backend
npm run oidc:doctor
```

Provider-specific env templates for existing IdPs:

- `backend/.env.oidc.keycloak.example`
- `backend/.env.oidc.authentik.example`

Copy one to `backend/.env`, update issuer/client/redirect values, then run `npm run oidc:doctor`.

Notes:

| Topic                       | Notes                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OIDC-only (`oidc_enforced`) | You typically do not use local bootstrap admin registration; first admin can be created through your IdP depending on config. |
| Reverse proxy               | Set `FRONTEND_URL` and `TRUST_PROXY` correctly or auth + websockets may fail.                                                 |
| ID token algorithm          | ExcaliDash defaults to `RS256`. If your IdP client is explicitly configured for another signed ID-token algorithm such as `HS256`, set `OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG` to match that exact client setting. `none` is not allowed, and `HS*` requires `OIDC_CLIENT_SECRET`. |
| Keycloak issuer format      | Use realm issuer URL: `https://<keycloak-host>/realms/<realm>`.                                                               |
| Authentik issuer format     | Use provider issuer URL: `https://<authentik-host>/application/o/<provider-slug>/`.                                           |
| Authentik `email_verified`  | If Authentik does not emit `email_verified=true`, either add the scope mapping or set `OIDC_REQUIRE_EMAIL_VERIFIED=false`.   |
| Redirect URI                | Must be exact callback: `https://<excalidash-host>/api/auth/oidc/callback`.                                                   |
| Split-horizon IdP networking | Set `OIDC_ISSUER_URL` to the browser-reachable issuer and optionally `OIDC_DISCOVERY_URL` to a backend-reachable internal URL. |
| OIDC admin mapping          | If `OIDC_ADMIN_GROUPS` is set, admin role is reconciled on each authenticated request for OIDC users: users in those groups are promoted to `ADMIN`, users not in those groups are demoted to `USER`. |
| Legacy sessions             | Users with old sessions (issued before group claims were embedded) should sign out/in once so OIDC group claims are refreshed. |

</details>

<details>
<summary>Local OIDC Test Stack (Docker + Keycloak)</summary>

### Local OIDC Test Stack (Docker + Keycloak)

This repo includes a Keycloak container + realm seed for local OIDC testing:

- Compose file: `docker-compose.oidc.yml`
- Realm import: `oidc/keycloak/realm-excalidash.json`

The realm seed intentionally contains **no users and no passwords**. You create a realm user and set a password via the Keycloak admin UI.

Start Keycloak:

```bash
# From repo root
# Choose a strong password; do not commit it.
export KEYCLOAK_ADMIN_PASSWORD='...'
docker compose -f docker-compose.oidc.yml up -d
```

Open Keycloak admin UI (realm/user setup):

- `http://localhost:8080/admin`
- Switch realm to `excalidash`
- Create a user and set a password in `Credentials`

Configure ExcaliDash backend for hybrid OIDC:

```bash
cd backend
cp .env.oidc.example .env
# If backend runs in Docker and Keycloak issuer is localhost for browser, set:
# OIDC_DISCOVERY_URL=http://keycloak:8080/realms/excalidash
# Ensure OIDC_REDIRECT_URI matches where your frontend is running:
# - http://localhost:6767/api/auth/oidc/callback (repo frontend dev default)
# - https://excalidash.example.com/api/auth/oidc/callback (production)
```

Stop/clean up:

```bash
docker compose -f docker-compose.oidc.yml down
```

</details>

<details>
<summary>Configuration (Backend Environment Variables)</summary>

Base values are documented in `backend/.env.example`. Common ones to care about:

| Variable                 | Default / Example         | Description                                                                         |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`           | `postgresql://excalidash:<password>@postgres:5432/excalidash?schema=public` | PostgreSQL connection string (bundled compose `postgres` service or an external/managed PostgreSQL). |
| `FRONTEND_URL`           | `http://localhost:6767`   | Allowed frontend origin(s), comma-separated for multiple entries.                   |
| `TRUST_PROXY`            | `false`                   | `false`, `true`, or hop count (for example `1`).                                    |
| `JWT_SECRET`             | `change-this-secret...`   | Recommended in production so sessions remain stable across restarts and migrations. |
| `CSRF_SECRET`            | `change-this-secret`      | Recommended in production so CSRF validation remains stable across restarts.        |
| `API_KEY_SECRET`         | Strong random secret      | HMAC secret for user API keys. Direct production starts require it; the Docker entrypoint can generate and persist it for a single instance. |
| `AUTH_MODE`              | `local`                   | `local`, `hybrid`, `oidc_enforced`.                                                 |
| `ENFORCE_HTTPS_REDIRECT` | `true`                    | Set to `false` to disable the built-in HTTP→HTTPS redirect when your outer gateway handles it. |
| `MAX_UPLOAD_MB`          | `250`                     | Multipart backup and legacy database upload limit.                                 |
| `MAX_JSON_BODY_MB`       | `100`                     | JSON body limit, including individual drawing imports.                             |
| `MAX_SOCKET_PAYLOAD_MB`  | `100`                     | Socket.IO message limit.                                                           |
| `MAX_IMPORT_DRAWING_MB`  | `100`                     | Maximum extracted drawing size in an ExcaliDash backup.                            |
| `MAX_IMPORT_TOTAL_EXTRACTED_MB` | `500`              | Maximum total extracted backup content.                                            |
| `MAX_DATA_URL_MB`        | `100`                     | Maximum embedded image data URL size retained during sanitization.                 |

</details>

## API Keys for MCP clients

Settings includes an **MCP / API Keys** area for creating user-scoped
credentials for future MCP integrations. Tokens use the `exd_` prefix, are
shown once at creation time, and are never stored in plaintext. Afterward,
ExcaliDash returns only a masked preview.

The MCP server is **live** at `/mcp` (see [ExcaliDash MCP Server](#excalidash-mcp-server)).

Claude Code example:

```bash
claude mcp add --transport http excalidash --scope local https://your-domain/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Use `--scope project` for repo-shared MCP configuration, but do not commit real
tokens. Prefer private local/user configuration or environment-variable
substitution for secrets.

Backend configuration:

```env
API_KEY_SECRET=change_me_strong_random_secret
```

Use a unique random value of at least 32 characters; the example above is a
placeholder and is rejected in production. The Docker entrypoint generates and
persists a value in `/app/prisma/.api_key_secret` when the variable is omitted.
Set it explicitly for portable backups or deployments with more than one
backend instance.

## ExcaliDash MCP Server

ExcaliDash ships a real **MCP server at `/mcp`** so an external agent (Claude
Code, or any MCP client) can create, edit, validate, repair, version, export and
save professional Excalidraw diagrams in the authenticated user's workspace. The
LLM stays external — the MCP only executes **exactly 25 deterministic tools**.

It also exposes **25 MCP prompts** (auto-discovered as `/mcp__excalidash__*`
commands once connected) and ships **25 optional Claude Code skills** you install
separately. See [docs/mcp.md](docs/mcp.md) and [docs/skills.md](docs/skills.md)
for the full reference and troubleshooting.

### Connecting

Authenticate with a Bearer `exd_` [API key](#api-keys-for-mcp-clients):

```bash
# scope: local | project | user
claude mcp add --transport http --scope local excalidash https://your-domain/mcp \
  --header "Authorization: Bearer exd_YOUR_TOKEN"
```

Other clients:

```json
{
  "mcpServers": {
    "excalidash": {
      "type": "http",
      "url": "https://your-domain/mcp",
      "headers": { "Authorization": "Bearer exd_YOUR_TOKEN" }
    }
  }
}
```

### The 25 tools

| Group | Tools |
| --- | --- |
| Core (9) | `read_mcp_guide`, `create_drawing`, `create_diagram_from_prompt`, `update_drawing`, `get_drawing`, `save_drawing`, `save_version`, `get_drawing_url`, `export_drawing` |
| Libraries (5) | `search_libraries`, `inspect_library`, `cache_library`, `add_library_items`, `add_library_items_normalized` |
| Quality (4) | `lint_drawing`, `score_drawing`, `repair_drawing`, `auto_polish_drawing` |
| Architecture (4) | `create_from_repo_analysis`, `apply_architecture_skill`, `validate_architecture`, `suggest_architecture_improvements` |
| Templates (3) | `list_templates`, `create_from_template`, `convert_diagram_type` |

Start every session with `read_mcp_guide`.

### 25 MCP prompts (auto-discovered)

Once the MCP is connected, `prompts/list` exposes **25 prompts** that appear in
Claude Code as commands:

```text
/mcp__excalidash__diagram_director
/mcp__excalidash__repo_to_system_design
/mcp__excalidash__security_architecture
… (25 total)
```

These are **not** tools (the 25-tool count is unchanged) — they are guided
skill prompts that drive the quality flow. They require no install: connecting
the MCP is enough.

### 25 Claude Code skills (optional, installed locally)

The repo also ships 25 real Claude Code skills under `skills/excalidash/`.
`claude mcp add` does **not** install these — copy them with the bundled CLI:

```bash
npx -y @excalidash/claude-skills install --scope user
npx -y @excalidash/claude-skills install --scope project --project-dir .
# local fallback (no npm publish needed):
node packages/excalidash-claude-skills/bin/install.cjs install --scope user
node packages/excalidash-claude-skills/bin/install.cjs verify
```

User scope copies to `~/.claude/skills/excalidash/*`; project/local to
`./.claude/skills/excalidash/*`. See [docs/skills.md](docs/skills.md).

### Quality flow (geometry-validated)

Generation is backed by a **geometry engine** (bounding boxes, **segment/rect
intersection**, text/element containment, minimum distance, grid snapping, font
size, arrow binding, density, viewport). Diagrams go through **lint → score
(0-100) → repair → auto-polish**.

`score_drawing` is honest: **hard blockers** (an arrow over readable text, content
over a frame title, stacked duplicates, text overflow, an item stranded outside
its frame) cap the score below the passing bar regardless of how few other issues
exist, and each penalty ships with **mathematical evidence** (intersection area,
overlap ratio, font px) plus an ordered **repair plan**. `repair_drawing` reroutes
arrows around text, moves edge labels off arrow paths, and grows frames;
`auto_polish_drawing` loops up to `MCP_MAX_REPAIR_ATTEMPTS` and **rolls back** any
pass that lowers the score. The default passing bar is
**`MCP_MIN_DRAWING_SCORE=95`**; `save_drawing` will not save below the bar unless
`asDraft` (and `MCP_ALLOW_LOW_SCORE_DRAFT`) is set.

- **Presets**: `handdrawn-clean`, `technical-docs`, `startup-deck`,
  `dark-architecture`, `minimal-whiteboard`, `portfolio-polished`.
- **Templates**: C4 (context/container), clean & hexagonal architecture, MCP
  server, API flow, n8n workflow, database schema, sequence, swimlane, security
  boundary, UI dashboard wireframe, portfolio architecture.
- **Architecture patterns** (`apply_architecture_skill`): clean, hexagonal, ddd,
  c4, cqrs, event-driven, microservices, modular-monolith, mcp.
- **Skills**: 25 installable Claude Code skills under `skills/excalidash/` (plus
  in-code guidance files under `backend/src/mcp/skills/`).

### Libraries

MCP library tools reuse the curated [library packs](#diagram-libraries-curated-packs):
prefer CORE/SPECIALIZED, cache on demand (`cache_library`, official allowlisted
source only), and normalize imports with `add_library_items_normalized`.

### Security

- Every request requires `Authorization: Bearer exd_...`; tokens are verified by
  HMAC, never stored or logged in plaintext, and revoked keys are rejected.
- Each key only accesses **its owner's** drawings, libraries and exports.
- `/mcp` has a dedicated rate limit (`MCP_RATE_LIMIT_MAX` per
  `MCP_RATE_LIMIT_WINDOW_SECONDS`) and optional Origin validation
  (`MCP_VALIDATE_ORIGIN`), and is exempt from cookie-CSRF (it is not
  cookie-authenticated).

### Export

`export_drawing` produces `.excalidraw` and **SVG** server-side. **PNG** has no
headless rasterizer in this stack, so it returns a structured fallback (export
SVG, or open the editable URL and export PNG from the Excalidraw client) rather
than failing.

### Environment variables

```env
MCP_ENABLED=true
MCP_ENDPOINT_PATH=/mcp
MCP_MIN_DRAWING_SCORE=95
MCP_MAX_REPAIR_ATTEMPTS=5
MCP_ALLOW_LOW_SCORE_DRAFT=true
MCP_MAX_ELEMENTS=5000
MCP_MAX_EXPORT_MB=100
MCP_DEFAULT_LIBRARY_MODE=curated   # which packs search returns
MCP_LIBRARY_MODE=curated           # off | curated | required (library usage enforcement)
MCP_PUBLIC_SEARCH_ENABLED=false
MCP_RATE_LIMIT_WINDOW_SECONDS=900
MCP_RATE_LIMIT_MAX=300
MCP_VALIDATE_ORIGIN=true
```

## Diagram Libraries (Curated Packs)

ExcaliDash ships a persisted, API-accessible **library management** layer that
the future MCP server uses to produce visually consistent diagrams. It mirrors
the [official Excalidraw libraries catalog](https://github.com/excalidraw/excalidraw-libraries)
into PostgreSQL (metadata only) and caches downloaded `.excalidrawlib` files on
a backend volume. **Settings → Diagram Libraries** exposes status, search, and
caching. There are three access modes:

- **CORE_PACK** — the default, always-preferred curated set (architecture,
  cloud, logos, people, UI/wireframe basics). Used when no category is
  requested; no public result can outrank it.
- **SPECIALIZED_PACK** — a curated family of nine categories:
  `architecture_advanced`, `cloud_devops`, `data_observability`, `logos_tech`,
  `people_storytelling`, `ui_wireframe`, `security`, `ai_mcp`,
  `business_product`. A library may belong to several categories, and category
  aliases work (e.g. `cloud`, `devops`, `aws`, `gcp`, `azure`, `k8s`).
- **PUBLIC_SEARCH** — searches the full official Excalidraw catalog. Results are
  flagged as **not curated** and ranked below curated matches unless
  `mode=public` is explicit. Disable it with
  `LIBRARY_PUBLIC_SEARCH_ENABLED=false`.

### Security

Public search means the **official Excalidraw catalog only** — not the open
internet. The backend hard-codes an allowlist (`raw.githubusercontent.com` under
`/excalidraw/excalidraw-libraries/main/...`, HTTPS only) and rejects absolute
external URLs, `..`/path traversal, oversized files (`LIBRARY_DOWNLOAD_MAX_MB`),
and non-`.excalidrawlib` payloads. Downloads happen only when a client
explicitly asks to cache/inspect a library; nothing is fetched ahead of time
beyond the catalog metadata.

### Refresh behavior

On startup the backend ensures the curated packs exist and (when
`LIBRARY_AUTO_REFRESH_ON_START=true`) refreshes the catalog and resolves pack
membership in the background. The work is idempotent and never blocks or crashes
startup — a name missing from the catalog (e.g. `Docker`) is logged, not fatal.
`POST /api/libraries/refresh` re-runs the same flow on demand.

### Cache persistence

Cached `.excalidrawlib` files live under `LIBRARY_CACHE_DIR` (default
`/app/data/libraries`), backed by the `library-data` Docker volume. Only
metadata, checksums (sha256), and a cache pointer are stored in PostgreSQL.

### Environment variables

```env
EXCALIDRAW_LIBRARIES_CATALOG_URL=https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries.json
EXCALIDRAW_LIBRARIES_BASE_URL=https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries
LIBRARY_CACHE_DIR=/app/data/libraries
LIBRARY_REFRESH_INTERVAL_HOURS=24
LIBRARY_DOWNLOAD_TIMEOUT_MS=15000
LIBRARY_DOWNLOAD_MAX_MB=25
LIBRARY_PUBLIC_SEARCH_ENABLED=true
LIBRARY_PUBLIC_SEARCH_MAX_RESULTS=25
LIBRARY_AUTO_REFRESH_ON_START=true
```

### API endpoints

All endpoints require authentication (consistent with the rest of the app).

| Method & path | Purpose |
| --- | --- |
| `GET /api/libraries/status` | catalog/curated counts, last refresh, cache dir, public-search flag |
| `POST /api/libraries/refresh` | refresh the official catalog and reseed packs (idempotent) |
| `GET /api/libraries/packs` | core + specialized categories with item counts |
| `GET /api/libraries/packs/:slug` | one pack with its libraries |
| `GET /api/libraries/search?q=&mode=core\|specialized\|public\|all&category=&limit=` | mode-aware search; results carry `sourceMode` and `curated` |
| `GET /api/libraries/:id` | normalized metadata + cache status for one library |
| `POST /api/libraries/:id/cache` | download + cache the `.excalidrawlib`; returns `itemCount`, `sha256`, `sizeBytes` |
| `GET /api/libraries/:id/items` | ensure cached and return bounded item names |

The actual `/mcp` server is not implemented here — this is the library
infrastructure it will build on.

# Development

For contributor workflow, `make dev` starts the app in local single-user mode so you can reproduce editor bugs without going through login/onboarding. Use `make dev-auth` if you need to test local auth or OIDC flows from your `backend/.env`.

<details>
<summary>Clone the Repository</summary>

## Clone the Repository

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git
```

</details>

<details>
<summary>Frontend</summary>

## Frontend

```bash
cd ExcaliDash/frontend
npm install

# Copy environment file and customize if needed
cp .env.example .env

npm run dev
```

</details>

<details>
<summary>Backend</summary>

## Backend

```bash
cd ExcaliDash/backend
npm install

# Copy environment file and customize if needed
cp .env.example .env

# Start a local PostgreSQL for development (bundled compose 'postgres' service)
docker compose up -d postgres

# Generate Prisma client and set up the database
npx prisma generate

# For local dev, create/apply migrations against your dev database
npx prisma migrate dev
# Or, to apply already-committed migrations without creating new ones:
# npx prisma migrate deploy

npm run dev
```

</details>

<details>
<summary>Migrating data from an old SQLite install</summary>

ExcaliDash is now PostgreSQL-only, and the in-app legacy SQLite import feature
was removed in this version. There is **no automated path** that reads an old
`dev.db` SQLite file into the new PostgreSQL database.

If you are upgrading from an older SQLite-based build, export your data with your
**current (SQLite) version before upgrading**:

- Export a full `.excalidash` backup, and/or export individual drawings as
  `.excalidraw` files.

Then upgrade to this PostgreSQL-based version, and once it is running on
PostgreSQL, import those files back through the dashboard **Import** action
(and **Settings → Advanced / Legacy → Import Backup** for the `.excalidash`
backup).

</details>

<details>
<summary>Simulate Auth Onboarding (Development)</summary>

### Simulate Auth Onboarding (Development)

To simulate first-run authentication choice flows in local development:

```bash
cd ExcaliDash/backend

# Preview what would change (no data modifications)
npm run dev:simulate-auth-onboarding:dry-run

# Simulate "fresh install" onboarding state
# (wipes drawings/collections/libraries and removes non-bootstrap users)
npm run dev:simulate-auth-onboarding:fresh

# Simulate "migration" onboarding state (ensures legacy data exists)
npm run dev:simulate-auth-onboarding:migration
```

After running a simulation while the backend is already running, wait about 5 seconds
(auth mode cache TTL) or restart the backend before refreshing the UI.

</details>

<details>
<summary>Setup and Operational Scripts</summary>

### Setup and Operational Scripts

In `backend/package.json` there are helper scripts for maintenance:

| Script          | Purpose                                    |
| --------------- | ------------------------------------------ |
| `admin:recover` | Emergency admin credential recovery/reset. |

Admin recovery example:

```bash
cd backend
npm run admin:recover -- --identifier admin@example.com --generate --activate --must-reset
```

Common flags:

| Flag                          | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `--password "<new-password>"` | Set explicit new password.                               |
| `--generate`                  | Generate a secure random password.                       |
| `--activate`                  | Activate the admin account immediately.                  |
| `--promote`                   | Promote user to admin role.                              |
| `--must-reset`                | Force password reset on first login.                     |
| `--disable-login-rate-limit`  | Temporarily disable login throttling for this operation. |

</details>

# Credits
If you find ExcaliDash useful, please consider [sponsoring](https://github.com/sponsors/ZimengXiong)
- Example designs from:
  - <https://github.com/Prakash-sa/system-design-ultimatum/tree/main>
  - <https://github.com/kitsteam/excalidraw-examples/tree/main>
- [The amazing work of Excalidraw & contributors](https://www.npmjs.com/package/@excalidraw/excalidraw)
