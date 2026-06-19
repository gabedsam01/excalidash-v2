export const buildMcpUrl = (origin: string): string =>
  new URL("/mcp", origin).toString();

export const CODEX_API_KEY_ENV = "EXCALIDASH_API_KEY";
export const CODEX_TOKEN_PLACEHOLDER = "exd_replace_with_your_api_key";

export const buildCodexConfig = (mcpUrl: string): string =>
  [
    "[mcp_servers.excalidash]",
    `url = "${mcpUrl}"`,
    `bearer_token_env_var = "${CODEX_API_KEY_ENV}"`,
    "tool_timeout_sec = 120",
    "startup_timeout_sec = 20",
    "enabled = true",
  ].join("\n");

export const buildCodexEnvCommand = (token: string): string =>
  `export ${CODEX_API_KEY_ENV}="${token}"`;

export const buildCodexFullSetup = (
  mcpUrl: string,
  token: string,
): string =>
  [
    "mkdir -p ~/.codex",
    "cat >> ~/.codex/config.toml <<'TOML'",
    "",
    buildCodexConfig(mcpUrl),
    "TOML",
    "",
    buildCodexEnvCommand(token),
    "codex",
  ].join("\n");
