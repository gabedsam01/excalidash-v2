# MCP

ExcaliDash V2 exposes a Streamable HTTP MCP server for authenticated AI-agent
workflows. No LLM runs inside ExcaliDash; the server provides deterministic
drawing, library, validation, repair, versioning, and export tools.

## Endpoint

For the Docker Compose quickstart, use the frontend proxy:

```txt
http://localhost:3000/mcp
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
exd_replace_with_your_api_key
```

## Codex

Codex reads global configuration from `~/.codex/config.toml`. A trusted project
can also provide `.codex/config.toml`; the Codex CLI and IDE extension share
these configuration layers.

Create or edit the configuration file:

```toml
[mcp_servers.excalidash]
url = "http://localhost:8000/mcp"
bearer_token_env_var = "EXCALIDASH_API_KEY"
tool_timeout_sec = 120
startup_timeout_sec = 20
enabled = true
```

Export the API key in the shell that starts Codex:

```bash
export EXCALIDASH_API_KEY="exd_replace_with_your_api_key"
codex
```

Inside Codex:

```txt
/mcp
```

The Settings screen provides buttons to copy the TOML block, environment
command, or full setup script. It substitutes the newly generated token only
during the one-time display.

Official references:

- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex config basics](https://developers.openai.com/codex/config-basic)
- [Codex config reference](https://developers.openai.com/codex/config-reference)

## Claude Code

Choose the scope that matches your use case:

```bash
claude mcp add --transport http excalidash --scope local http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_replace_with_your_api_key"

claude mcp add --transport http excalidash --scope project http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_replace_with_your_api_key"

claude mcp add --transport http excalidash --scope user http://localhost:8000/mcp \
  --header "Authorization: Bearer exd_replace_with_your_api_key"
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
        "Authorization": "Bearer exd_replace_with_your_api_key"
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
  `http://localhost:3000/mcp`; the default Compose file exposes only the
  frontend.
