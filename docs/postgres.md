# PostgreSQL

ExcaliDash V2 requires PostgreSQL at runtime. SQLite runtime storage is no
longer used.

PostgreSQL was adopted for production-oriented usage: multi-user storage,
stronger backup/restore practices, indexed queries, API keys, MCP workflows,
and larger drawing and snapshot histories.

## Connection variables

The current Prisma datasource requires:

```env
DATABASE_URL=postgresql://excalidash:change_me@postgres:5432/excalidash?schema=public&sslmode=disable
```

The host is `postgres` when the backend runs in the supplied Compose network.
For a backend running directly on the host, use `localhost`.

Some managed-database and migration workflows separate pooled runtime traffic
from a direct migration connection:

```env
DIRECT_URL=postgresql://excalidash:change_me@postgres:5432/excalidash?schema=public&sslmode=disable
```

The current `schema.prisma` reads only `DATABASE_URL`; `DIRECT_URL` is optional
and has no runtime effect unless the Prisma datasource is updated to reference
it.

## Prisma migrations

Create or update migrations during local development:

```bash
cd backend
npx prisma migrate dev
```

Apply committed migrations without creating new migration files:

```bash
cd backend
npx prisma migrate deploy
```

The backend container runs `prisma migrate deploy` at startup by default.

## Backup

Create a compressed backup from the bundled PostgreSQL service:

```bash
docker compose exec -T postgres pg_dump \
  -U excalidash -d excalidash -Fc > excalidash.dump
```

Store the dump separately from the Compose volumes.

## Restore

Restoring can replace existing data. Validate the target database and backup
before running:

```bash
docker compose exec -T postgres pg_restore \
  --clean --if-exists --no-owner \
  -U excalidash -d excalidash < excalidash.dump
```

## Legacy SQLite migration

There is no repository script that imports a legacy SQLite database directly
into PostgreSQL.

If upgrading from an older SQLite-based installation:

1. Back up the SQLite database before upgrading.
2. Use the old installation to export an ExcaliDash backup or individual
   `.excalidraw` files.
3. Start ExcaliDash V2 with PostgreSQL and let Prisma apply the schema
   migrations.
4. Import the exported data through the dashboard.
5. Validate users, collections, drawings, permissions, and snapshots before
   decommissioning the legacy installation.

Do not repeat a one-time import without checking the target data for
duplicates.
