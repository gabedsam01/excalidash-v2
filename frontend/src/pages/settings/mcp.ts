export const buildMcpUrl = (origin: string): string =>
  new URL("/mcp", origin).toString();

export const CODEX_SERVER_NAME = "excalidash";
export const CODEX_TOKEN_PLACEHOLDER = "exd_REPLACE_WITH_YOUR_API_KEY";

// Codex shares one MCP configuration between the CLI and the IDE extension. It
// supports exactly two real config layers (https://developers.openai.com/codex/mcp):
//   - "user":    ~/.codex/config.toml      (available in every project)
//   - "project": ./.codex/config.toml      (loaded only for TRUSTED projects)
// The Codex CLI has no `--scope`, `--transport`, or `--header` flags, so we use
// `codex mcp add --url` to register the Streamable HTTP server and append an
// inline `http_headers` table that carries the bearer token. No env var, no
// `export`, no `bearer_token_env_var`, and no manual file editing.
// Project scope writes ./.codex/config.toml via a project-local CODEX_HOME so the
// CLI manages just the excalidash entry idempotently; a plain `codex` run then
// reads that file once the project is trusted (accept Codex's trust prompt).
export type CodexScope = "user" | "project";

export const CODEX_SCOPES: readonly CodexScope[] = ["user", "project"];

// The inline header table appended after `codex mcp add`. A leading blank line
// keeps it separated from whatever the CLI wrote first.
const codexHttpHeadersBlock = (token: string): string =>
  [
    "",
    `[mcp_servers.${CODEX_SERVER_NAME}.http_headers]`,
    `Authorization = "Bearer ${token}"`,
  ].join("\n");

// One copy-paste, idempotent command per scope. `codex mcp remove` first so a
// re-run (e.g. key rotation) never duplicates the TOML table.
export const buildCodexAddCommand = (
  mcpUrl: string,
  token: string,
  scope: CodexScope,
): string => {
  const headers = codexHttpHeadersBlock(token);

  if (scope === "project") {
    return [
      "mkdir -p .codex",
      `CODEX_HOME="$PWD/.codex" codex mcp remove ${CODEX_SERVER_NAME} >/dev/null 2>&1`,
      `CODEX_HOME="$PWD/.codex" codex mcp add ${CODEX_SERVER_NAME} --url ${mcpUrl}`,
      "cat >> .codex/config.toml <<'TOML'",
      headers,
      "TOML",
    ].join("\n");
  }

  return [
    `codex mcp remove ${CODEX_SERVER_NAME} >/dev/null 2>&1`,
    `codex mcp add ${CODEX_SERVER_NAME} --url ${mcpUrl}`,
    "cat >> ~/.codex/config.toml <<'TOML'",
    headers,
    "TOML",
  ].join("\n");
};

export const buildCodexUsefulCommands = (): string =>
  [
    "codex mcp list",
    `codex mcp get ${CODEX_SERVER_NAME}`,
    `codex mcp remove ${CODEX_SERVER_NAME}`,
  ].join("\n");

// Advanced, optional: the equivalent hand-written block. Always inline
// `http_headers`, never `bearer_token_env_var`.
export const buildCodexManualToml = (mcpUrl: string, token: string): string =>
  [
    `[mcp_servers.${CODEX_SERVER_NAME}]`,
    `url = "${mcpUrl}"`,
    `http_headers = { "Authorization" = "Bearer ${token}" }`,
    "enabled = true",
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 300",
  ].join("\n");
