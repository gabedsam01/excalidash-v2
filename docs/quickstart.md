# Quickstart

This quickstart builds ExcaliDash V2 from the repository source. It does not
assume that Docker images have been published for this fork.

## Requirements

- Docker and Docker Compose
- Git

## Clone

```bash
git clone YOUR_REPOSITORY_URL excalidash-v2
cd excalidash-v2
cp .env.example .env
```

## Minimal `.env`

Replace every `change_me` value before production use.

```env
FRONTEND_PORT=3000
POSTGRES_USER=excalidash
POSTGRES_PASSWORD=change_me
POSTGRES_DB=excalidash
DATABASE_URL=postgresql://excalidash:change_me@postgres:5432/excalidash?schema=public&sslmode=disable
DIRECT_URL=postgresql://excalidash:change_me@postgres:5432/excalidash?schema=public&sslmode=disable
FRONTEND_URL=http://localhost:3000
AUTH_MODE=local
JWT_SECRET=change_me_please_generate_a_long_random_secret
CSRF_SECRET=change_me_please_generate_a_long_random_secret
API_KEY_SECRET=change_me_please_generate_a_long_random_secret
MCP_ENABLED=true
```

`DATABASE_URL` is the connection used by the current Prisma runtime.
`DIRECT_URL` is included for tooling or future managed-database workflows, but
the current Prisma datasource does not read it.

## Validate configuration

```bash
docker compose config
```

## Start

```bash
docker compose up -d --build
```

## Open

```txt
http://localhost:3000
```

Complete the first-run authentication setup in the browser.

## Health check

```bash
curl -i http://localhost:3000/api/health
```

## MCP endpoint

```txt
http://localhost:3000/mcp
```

Create a key in **Settings → MCP / API Keys** before connecting an MCP client.
See [mcp.md](mcp.md).

## Agent Skills

Install the ExcaliDash V2 Agent Skills in the current checkout:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local
```

This creates `.claude/skills` and `.agents/skills`. See
[skills.md](skills.md) for agent selection, verification, and removal.

## Logs

```bash
docker compose ps
docker compose logs backend --tail=200
```

## Stop

```bash
docker compose down
```

## Reset local data

This deletes the local PostgreSQL database and other named volumes:

```bash
docker compose down -v
```
