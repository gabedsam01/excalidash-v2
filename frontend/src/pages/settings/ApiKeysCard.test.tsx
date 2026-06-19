import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));

vi.mock("../../api", () => apiMocks);

import { ApiKeysCard } from "./ApiKeysCard";
import { buildMcpUrl } from "./mcp";

const existingKey = {
  id: "key-1",
  name: "Existing key",
  client: "claude-code" as const,
  preview: "exd_0123456789abcdef...wxyz",
  prefix: "exd_0123456789abcdef",
  suffix: "wxyz",
  createdAt: "2026-06-18T10:00:00.000Z",
  lastUsedAt: null,
};

describe("ApiKeysCard", () => {
  beforeEach(() => {
    apiMocks.getApiKeys.mockReset();
    apiMocks.createApiKey.mockReset();
    apiMocks.revokeApiKey.mockReset();
    apiMocks.isAxiosError.mockReturnValue(false);
    apiMocks.getApiKeys.mockResolvedValue([]);
    apiMocks.revokeApiKey.mockResolvedValue({ success: true });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows loading and then the empty state", async () => {
    let resolveKeys: (keys: typeof existingKey[]) => void = () => {};
    apiMocks.getApiKeys.mockReturnValue(
      new Promise((resolve) => {
        resolveKeys = resolve;
      }),
    );

    render(<ApiKeysCard />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading API keys");

    resolveKeys([]);
    expect(await screen.findByText("No API keys yet")).toBeInTheDocument();
  });

  it("generates a key and shows the one-time token panel", async () => {
    const generated = {
      ...existingKey,
      id: "key-created",
      name: "Claude Code notebook",
      token:
        "exd_0123456789abcdef_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
    };
    apiMocks.createApiKey.mockResolvedValue(generated);

    render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Claude Code notebook" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate API Key" }),
    );

    expect(
      await screen.findByText(
        "Copy this token now. It will only be shown once.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(generated.token)).toBeInTheDocument();
    expect(apiMocks.createApiKey).toHaveBeenCalledWith({
      name: "Claude Code notebook",
      client: "claude-code",
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy API token" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        generated.token,
      );
    });
  });

  it("shows only the masked preview when loaded from the API", async () => {
    apiMocks.getApiKeys.mockResolvedValue([existingKey]);
    render(<ApiKeysCard />);

    expect(
      await screen.findByText("exd_0123456789abcdef...wxyz"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Copy this token now/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Never used/)).toBeInTheDocument();
    expect(screen.getAllByText(TOKEN_PLACEHOLDER_TEXT).length).toBeGreaterThan(0);
  });

  it("shows all Claude Code scopes with the browser-origin MCP URL", async () => {
    render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    const expectedUrl = buildMcpUrl(window.location.origin);
    expect(screen.getByText(new RegExp(`MCP URL: ${expectedUrl}`))).toBeInTheDocument();
    // Target the `claude mcp add` command specifically (skills install commands
    // also mention --scope user/project, so match the full claude command).
    expect(screen.getByText(/claude mcp add.*--scope local/)).toHaveTextContent(expectedUrl);
    expect(screen.getByText(/claude mcp add.*--scope project/)).toHaveTextContent(expectedUrl);
    expect(screen.getByText(/claude mcp add.*--scope user/)).toHaveTextContent(expectedUrl);
  });

  it("shows copyable JSON for other MCP clients", async () => {
    render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    fireEvent.change(screen.getByLabelText("MCP client"), {
      target: { value: "other" },
    });

    expect(screen.getByText(/"mcpServers"/)).toBeInTheDocument();
    expect(screen.getByText(/"Authorization": "Bearer <YOUR_API_KEY>"/)).toBeInTheDocument();
    expect(screen.getByText(/streamable-http/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy MCP JSON" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(`"url": "${buildMcpUrl(window.location.origin)}"`),
      );
    });
  });

  it("shows Codex commands using `codex mcp add` with an inline header (no env var)", async () => {
    const { container } = render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    fireEvent.change(screen.getByLabelText("MCP client"), {
      target: { value: "codex" },
    });

    const expectedUrl = buildMcpUrl(window.location.origin);
    const panelText = container.textContent ?? "";

    // Primary flow uses `codex mcp add --url` for both scopes.
    expect(
      screen.getAllByText(
        new RegExp(`codex mcp add excalidash --url ${expectedUrl}`),
      ).length,
    ).toBeGreaterThanOrEqual(2);

    // Token is passed inline as an Authorization header, with the placeholder.
    expect(panelText).toContain(
      'Authorization = "Bearer exd_REPLACE_WITH_YOUR_API_KEY"',
    );
    expect(panelText).toContain("[mcp_servers.excalidash.http_headers]");

    // Project scope targets ./.codex/config.toml.
    expect(panelText).toContain("CODEX_HOME=\"$PWD/.codex\" codex mcp add");
    expect(panelText).toContain("cat >> .codex/config.toml");

    // Forbidden patterns must NOT appear in the main flow.
    expect(panelText).not.toContain("bearer_token_env_var");
    expect(panelText).not.toContain("export ");
    expect(panelText).not.toMatch(/\bsetx\b/);

    // Useful commands + /mcp guidance.
    expect(panelText).toContain("codex mcp list");
    expect(panelText).toContain("codex mcp remove excalidash");
    expect(screen.getByText(/inside Codex to confirm/)).toHaveTextContent("/mcp");

    // Copy buttons copy the exact command for each scope.
    fireEvent.click(
      screen.getByRole("button", { name: "Copy codex user command" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("codex mcp add excalidash --url"),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        'Authorization = "Bearer exd_REPLACE_WITH_YOUR_API_KEY"',
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy codex project command" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('CODEX_HOME="$PWD/.codex" codex mcp add'),
      );
    });
  });

  it("embeds the freshly generated token in the Codex command (one-time reveal)", async () => {
    const generated = {
      ...existingKey,
      id: "key-codex",
      name: "Codex notebook",
      client: "codex" as const,
      token: "exd_0123456789abcdef_codextoken000000000000000000000000",
    };
    apiMocks.createApiKey.mockResolvedValue(generated);

    render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    fireEvent.change(screen.getByLabelText("MCP client"), {
      target: { value: "codex" },
    });
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Codex notebook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate API Key" }));

    await screen.findByText("Copy this token now. It will only be shown once.");

    fireEvent.click(
      screen.getByRole("button", { name: "Copy codex user command" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(`Authorization = "Bearer ${generated.token}"`),
      );
    });
  });

  it("revokes a key and removes it from the active list", async () => {
    apiMocks.getApiKeys.mockResolvedValue([existingKey]);
    render(<ApiKeysCard />);
    await screen.findByText(existingKey.preview);

    fireEvent.click(
      screen.getByRole("button", { name: `Delete key ${existingKey.name}` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete key" }));

    await waitFor(() => {
      expect(apiMocks.revokeApiKey).toHaveBeenCalledWith(existingKey.id);
    });
    expect(await screen.findByText("No API keys yet")).toBeInTheDocument();
    expect(screen.queryByText(existingKey.preview)).not.toBeInTheDocument();
  });
});

const TOKEN_PLACEHOLDER_TEXT = /<YOUR_API_KEY>/;
