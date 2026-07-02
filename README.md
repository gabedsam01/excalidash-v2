# ExcaliDash V2

ExcaliDash V2 is a self-hosted dashboard and organizer for Excalidraw drawings.
It provides collections, search, import/export, live collaboration, local or
OIDC authentication, API keys, personal user templates/libraries, and an MCP
server for AI-agent workflows.

## Credits

ExcaliDash V2 is an evolved fork of the original
[ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) project by
ZimengXiong. This repository preserves the upstream attribution and license
while extending the project with PostgreSQL-only runtime storage, MCP tooling,
API keys, user-owned template/library workflows, and deployment improvements.

## Database

PostgreSQL is required at runtime. SQLite was removed from the runtime and is
mentioned only for legacy migration context. PostgreSQL provides reliable
production persistence, consistent migrations, concurrent access, and
predictable deployments.

### Personal templates only

The old curated/public Excalidraw catalog tables are intentionally removed. On
upgrade, the migration `20260702180000_drop_curated_libraries` drops the legacy
curated-library tables if they exist:

- `ExcalidrawLibraryCatalogItem`
- `ExcalidrawLibraryPack`
- `ExcalidrawLibraryPackItem`

User-owned templates are kept through the existing `Library` table and `/library`
endpoint. In plain Portuguese: sai biblioteca curada do projeto original, entra
a biblioteca do dono da instância. Bem mais limpo.

## Fast install with GHCR

The GHCR workflow in this repository publishes the required images after it
runs successfully on `main` or a `v*` tag. Once the packages are available:

```bash
mkdir excalidash-v2
cd excalidash-v2
curl -fsSL https://raw.githubusercontent.com/gabedsam01/excalidash-v2/main/quickstart.sh | bash
docker compose up -d
```

Open:

```txt
http://localhost:6767
```

The quickstart creates `.env`, generates 512-bit database/JWT/CSRF/API-key
secrets, and downloads the single user-facing `docker-compose.yml`. It does not
start containers unless invoked with `--up`.

Manual installation:

```bash
curl -fsSL https://raw.githubusercontent.com/gabedsam01/excalidash-v2/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/gabedsam01/excalidash-v2/main/.env.example -o .env
# Replace every generate_with_quickstart value before starting.
docker compose up -d
```

## MCP and API keys

Create a revocable API key in **Settings → MCP / API Keys**. The Compose MCP
endpoint is:

```txt
http://localhost:6767/mcp
```

Install the optional ExcaliDash V2 Agent Skills:

```bash
npx -y @gabedsam01/excalidash-v2-skills@latest --local --yes
```

## Redis (optional speed layer)

Redis is optional but recommended for faster self-hosted deployments. PostgreSQL
remains the source of truth; Redis caches hot drawings, metadata, and save
coordination state. The quickstart enables it by default (`REDIS_ENABLED=true`);
set `REDIS_ENABLED=false` to run without it. If Redis is unavailable the backend
falls back to PostgreSQL automatically. See [docs/redis.md](docs/redis.md).

## Language (English / Português)

The interface is available in English (default) and Brazilian Portuguese, with a
language button on the login, dashboard, and settings screens (the choice is
saved in the browser). See [docs/i18n.md](docs/i18n.md).

## Snapshots and large drawings

ExcaliDash V2 keeps only the latest N snapshots per drawing by default to prevent
PostgreSQL growth from large Excalidraw files with embedded images. Saves are
optimized to avoid creating large snapshots on every autosave. Retention,
snapshot cadence, server-side image optimization, and autosave timing are all
configurable via environment variables (see `.env.example` and
[docs/postgres.md](docs/postgres.md)). A safe, dry-run-by-default
`scripts/prune-snapshots.cjs` cleans up an existing oversized table.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Deployment](docs/deployment.md)
- [GHCR images](docs/ghcr.md)
- [PostgreSQL](docs/postgres.md)
- [Redis (optional)](docs/redis.md)
- [Backend](docs/backend.md)
- [Frontend](docs/frontend.md)
- [Internationalization](docs/i18n.md)
- [MCP](docs/mcp.md)
- [Agent Skills](docs/skills.md)

## Security

- Keep `.env` private and never commit generated credentials.
- The authenticated runtime-config endpoint returns only defined/source status
  and truncated SHA-256 fingerprints, never raw secrets or database URLs.
- Back up PostgreSQL and the `backend_data` volume before upgrades.
- Pin version or SHA image tags for reproducible production deployments.

## License

ExcaliDash V2 is distributed under AGPL-3.0 and preserves upstream
attribution. See [LICENSE](LICENSE).
