# ExcaliDash V2

A self-hosted dashboard and organizer for Excalidraw with multi-user
collaboration, scoped sharing, PostgreSQL storage, API keys, MCP tools, curated
libraries, and AI-agent workflows.

## Credits

ExcaliDash V2 is based on the original ExcaliDash project by ZimengXiong. This
repository keeps attribution to the original project and extends it with
PostgreSQL-only storage, MCP tooling, API keys, curated Excalidraw libraries,
and deployment improvements.

## What changed in V2

- PostgreSQL is now required for runtime storage.
- SQLite runtime storage was removed.
- Legacy SQLite installations should be backed up and migrated before
  production use.
- API keys are available for MCP clients.
- The MCP endpoint is available at `/mcp`.
- Codex and Claude Code setup snippets are available in Settings.
- Curated Excalidraw libraries and MCP quality/repair tooling were added.

ExcaliDash V2 uses PostgreSQL as the required runtime database. Earlier
installations based on SQLite should be migrated before upgrading. PostgreSQL
was adopted to support larger deployments, multi-user usage, API keys, indexed
queries, MCP workflows, and production backup/restore practices.

## Features

- Organize Excalidraw drawings into collections.
- Search, import, export, version, and restore drawings.
- Collaborate in real time and share drawings with scoped permissions.
- Use local authentication or optional OIDC.
- Connect Codex, Claude Code, and other MCP clients with revocable API keys.
- Generate, validate, repair, and export diagrams through MCP tools.
- Search and use curated Excalidraw libraries.

## Quickstart

See [docs/quickstart.md](docs/quickstart.md) for the source-build Docker Compose
setup. The documented local frontend is `http://localhost:3000`, and the MCP
endpoint is `http://localhost:3000/mcp`.

## Documentation

- [Quickstart](docs/quickstart.md)
- [PostgreSQL](docs/postgres.md)
- [Backend](docs/backend.md)
- [Frontend](docs/frontend.md)
- [MCP](docs/mcp.md)
- [Deployment](docs/deployment.md)
- [Agent Skills](docs/skills.md)

## Agent Skills

Install ExcaliDash V2 skills for Claude Code and universal agents:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local
```

For global user installation:

```bash
npx -y @gabedsam01/excalidash-v2-skills --user
```

See [docs/skills.md](docs/skills.md).

## Security notes

- Replace all placeholder secrets before production use.
- Never commit API keys, database credentials, JWT secrets, or CSRF secrets.
- An API key is shown in full only when it is created; stored keys remain
  masked.
- Back up PostgreSQL and the persisted secrets volume before upgrades.

## License

ExcaliDash V2 is distributed under AGPL-3.0 and preserves upstream attribution.
See [LICENSE](LICENSE).
