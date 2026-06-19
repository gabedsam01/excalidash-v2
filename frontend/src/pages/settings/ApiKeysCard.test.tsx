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

  it("shows copyable Codex config, environment command, and full setup", async () => {
    render(<ApiKeysCard />);
    await screen.findByText("No API keys yet");

    fireEvent.change(screen.getByLabelText("MCP client"), {
      target: { value: "codex" },
    });

    const expectedUrl = buildMcpUrl(window.location.origin);
    expect(
      screen.getAllByText(/\[mcp_servers\.excalidash\]/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        /bearer_token_env_var = "EXCALIDASH_API_KEY"/,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(expectedUrl)).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/exd_replace_with_your_api_key/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/inside Codex to inspect/)).toHaveTextContent("/mcp");

    fireEvent.click(
      screen.getByRole("button", { name: "Copy Codex config.toml" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("[mcp_servers.excalidash]"),
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Copy Codex env command" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'export EXCALIDASH_API_KEY="exd_replace_with_your_api_key"',
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Copy full Codex setup" }),
    );
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("mkdir -p ~/.codex"),
      );
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("codex"),
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
