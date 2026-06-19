# MCP

ExcaliDash V2 exposes a Streamable HTTP MCP server for authenticated AI-agent
workflows. No LLM runs inside ExcaliDash; the server provides deterministic
drawing, library, validation, repair, versioning, and export tools.

## Endpoint

For the Docker Compose quickstart, use the frontend proxy:

```txt
http://localhost:6767/mcp
```

For a backend started directly on its default port, use:

```txt
http://localhost:8000/mcp
```

The endpoint accepts MCP requests over `POST`. A browser `GET` request returns
`405 Method Not Allowed`.

## Authentication

Create an API key in **Settings → MCP / API Keys** and use it as a Bearer token.
The full token is shown only once.

Documentation and shared configuration must use this placeholder:

```txt
exd_REPLACE_WITH_YOUR_API_KEY
```

## Codex

Codex shares one MCP configuration between the CLI and the IDE extension. It
lives in `config.toml` and supports two layers: user-level at
`~/.codex/config.toml`, or project-scoped at `./.codex/config.toml` for trusted
projects.

The Codex CLI has no `--transport`, `--header`, or `--scope` flags. The setup
below uses `codex mcp add --url` to register the Streamable HTTP server and
appends an inline `http_headers` table that carries the bearer token. There is
no environment variable, no `export`, no `bearer_token_env_var`, and no manual
file editing — paste the command and run it. The leading `codex mcp remove`
makes the command safe to re-run (for example, when rotating a key).

### User scope — `~/.codex/config.toml`

```bash
codex mcp remove excalidash >/dev/null 2>&1
codex mcp add excalidash --url http://localhost:6767/mcp
cat >> ~/.codex/config.toml <<'TOML'

[mcp_servers.excalidash.http_headers]
Authorization = "Bearer exd_REPLACE_WITH_YOUR_API_KEY"
TOML
```

### Project scope — `./.codex/config.toml`

```bash
mkdir -p .codex
CODEX_HOME="$PWD/.codex" codex mcp remove excalidash >/dev/null 2>&1
CODEX_HOME="$PWD/.codex" codex mcp add excalidash --url http://localhost:6767/mcp
cat >> .codex/config.toml <<'TOML'

[mcp_servers.excalidash.http_headers]
Authorization = "Bearer exd_REPLACE_WITH_YOUR_API_KEY"
TOML
```

`codex mcp add` registers the Streamable HTTP server (`--url`); the appended
`http_headers` table carries the bearer token inline. Re-running is safe — the
`codex mcp remove` line clears any previous entry first.

> **Project scope requires trust.** Codex loads `./.codex/config.toml` only for
> **trusted** projects. The project-local `CODEX_HOME` above is just how the CLI
> writes that file; a plain `codex` run reads it once the folder is trusted. On
> your first `codex` launch in the project, accept the trust prompt (or it is
> already trusted if you have used Codex there before). To trust it
> non-interactively, add `[projects."<absolute-project-path>"]` with
> `trust_level = "trusted"` to `~/.codex/config.toml`. User scope needs no trust.

### Useful commands

```bash
codex mcp list
codex mcp get excalidash
codex mcp remove excalidash
```

Start Codex with `codex`, then run `/mcp` inside Codex to confirm the
`excalidash` server is enabled with its tools available.

The Settings screen generates these same commands and substitutes the newly
generated token only during the one-time display.

### Advanced: manual config.toml

Prefer the commands above. If you edit `config.toml` by hand, the equivalent
block uses inline `http_headers` (never `bearer_token_env_var`):

```toml
[mcp_servers.excalidash]
url = "http://localhost:6767/mcp"
http_headers = { "Authorization" = "Bearer exd_REPLACE_WITH_YOUR_API_KEY" }
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 300
```

Official references:

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex configuration reference](https://developers.openai.com/codex/config-reference)

## Claude Code

Choose the scope that matches your use case:

```bash
claude mcp add --transport http excalidash --scope local http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_REPLACE_WITH_YOUR_API_KEY"

claude mcp add --transport http excalidash --scope project http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_REPLACE_WITH_YOUR_API_KEY"

claude mcp add --transport http excalidash --scope user http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_REPLACE_WITH_YOUR_API_KEY"
```

- `local`: private to the current project.
- `project`: writes project configuration; never commit a real token.
- `user`: available across the user's projects.

MCP prompts are discovered automatically. Optional Claude Code skills are
installed separately; see [skills.md](skills.md).

## Universal MCP JSON

Clients that use JSON configuration can start with:

```json
{
  "mcpServers": {
    "excalidash": {
      "type": "http",
      "url": "http://localhost:8000/mcp",
      "headers": {
        "Authorization": "Bearer exd_REPLACE_WITH_YOUR_API_KEY"
      }
    }
  }
}
```

Some clients call this transport `streamable-http` instead of `http`.

## Security

- Do not commit API keys or place them in documentation.
- Do not store a token in browser local storage.
- Revoke a key immediately if it is exposed.
- Existing keys are listed only by masked prefix and suffix.
- Prefer environment-variable token injection when the client supports it.

## Troubleshooting

- HTML from `/mcp`: the request reached the frontend SPA instead of the MCP
  proxy or backend.
- `401 Unauthorized`: the Bearer token is missing, invalid, or revoked.
- Empty tools or prompts: confirm `MCP_ENABLED=true` and rebuild the backend.
- Direct backend connection fails under Compose: use
  `http://localhost:6767/mcp`; the default Compose file exposes only the
  frontend.
