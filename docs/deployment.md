# Deployment

The supported repository workflow builds the backend and frontend from source
with Docker Compose. The default Compose topology contains PostgreSQL, one
backend instance, and one frontend Nginx instance.

## Local Compose deployment

Follow [quickstart.md](quickstart.md). It configures the frontend at:

```txt
http://localhost:3000
```

Only the frontend port is published for normal application traffic. Nginx
proxies `/api`, `/socket.io`, and `/mcp` to the backend.

## Runtime boundaries

| Component | Local address | Purpose |
| --- | --- | --- |
| Frontend | `http://localhost:3000` | UI and reverse proxy |
| Backend | `http://localhost:8000` | Direct host-run development |
| Frontend dev server | `http://localhost:5173` | Optional Vite override |
| MCP through Compose | `http://localhost:3000/mcp` | Recommended Compose endpoint |
| MCP through backend | `http://localhost:8000/mcp` | Direct backend development |

The repository's Vite script currently defaults to port `6767`. Set a local
port override when a workflow requires `http://localhost:5173`.

## Required production controls

- Replace placeholder database and application secrets.
- Keep `TRUST_PROXY=false` unless every request passes through a trusted proxy.
- Set `FRONTEND_URL` to the exact origin used by the browser.
- Keep one backend replica until collaboration state has a shared Socket.IO
  adapter.
- Back up PostgreSQL and persisted application secrets before upgrades.
- Pin container images to a version or digest when an image publishing workflow
  is introduced.

## Health and logs

```bash
curl -i http://localhost:3000/api/health
docker compose ps
docker compose logs backend --tail=200
docker compose logs frontend --tail=200
```

## Database migrations

The backend entrypoint runs `prisma migrate deploy` when
`RUN_MIGRATIONS=true`, which is the default. See [postgres.md](postgres.md) for
backup, restore, and legacy migration guidance.

## GHCR status

This repository does not currently contain a workflow that publishes ExcaliDash
V2 images to GitHub Container Registry. Do not document or deploy a GHCR image
as available until such a workflow has built and published it.

If GHCR publishing is added later, use GitHub's official guidance for
`GITHUB_TOKEN`, `packages: write`, image metadata, immutable action references,
and build provenance:

- [Publishing Docker images](https://docs.github.com/actions/guides/publishing-docker-images)
- [Working with the Container registry](https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
