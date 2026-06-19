import React, { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import * as api from "../../api";
import type {
  ApiKeyClient,
  ApiKeySummary,
  CreatedApiKey,
} from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import {
  buildCodexAddCommand,
  buildCodexManualToml,
  buildCodexUsefulCommands,
  buildMcpUrl,
  CODEX_SCOPES,
  CODEX_SERVER_NAME,
  CODEX_TOKEN_PLACEHOLDER,
} from "./mcp";

const TOKEN_PLACEHOLDER = "<YOUR_API_KEY>";

// Constant — no inputs, so it lives at module scope (no per-render recompute).
const CODEX_USEFUL_COMMANDS = buildCodexUsefulCommands();

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (api.isAxiosError(error)) {
    return error.response?.data?.message || error.response?.data?.error || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

type CopyButtonProps = {
  text: string;
  label: string;
  buttonText?: string;
  copied: boolean;
  onCopy: (text: string, label: string) => void;
};

const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label,
  buttonText,
  copied,
  onCopy,
}) => (
  <button
    type="button"
    onClick={() => onCopy(text, label)}
    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-bold text-slate-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
    aria-label={label}
  >
    {copied ? <Check size={14} /> : <Copy size={14} />}
    {copied ? "Copied" : buttonText || "Copy"}
  </button>
);

export const ApiKeysCard: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [client, setClient] = useState<ApiKeyClient>("claude-code");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeySummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const mcpUrl = useMemo(() => buildMcpUrl(window.location.origin), []);
  const instructionToken = createdKey?.token || TOKEN_PLACEHOLDER;
  const codexToken = createdKey?.token || CODEX_TOKEN_PLACEHOLDER;

  const claudeCommands = useMemo(
    () =>
      (["local", "project", "user"] as const).map((scope) => ({
        scope,
        command: `claude mcp add --transport http excalidash --scope ${scope} ${mcpUrl} --header "Authorization: Bearer ${instructionToken}"`,
      })),
    [instructionToken, mcpUrl],
  );

  const otherClientJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            excalidash: {
              type: "http",
              url: mcpUrl,
              headers: {
                Authorization: `Bearer ${instructionToken}`,
              },
            },
          },
        },
        null,
        2,
      ),
    [instructionToken, mcpUrl],
  );

  const codexCommands = useMemo(
    () =>
      CODEX_SCOPES.map((scope) => ({
        scope,
        command: buildCodexAddCommand(mcpUrl, codexToken, scope),
      })),
    [codexToken, mcpUrl],
  );
  const codexManualToml = useMemo(
    () => buildCodexManualToml(mcpUrl, codexToken),
    [codexToken, mcpUrl],
  );

  useEffect(() => {
    let active = true;
    const loadKeys = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.getApiKeys();
        if (active) setKeys(data);
      } catch (error) {
        if (active) {
          setLoadError(getErrorMessage(error, "Failed to load API keys."));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadKeys();
    return () => {
      active = false;
    };
  }, []);

  const copyText = async (text: string, label: string) => {
    setActionError(null);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is not available in this browser.");
      }
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      window.setTimeout(() => {
        setCopiedLabel((current) => (current === label ? null : current));
      }, 1500);
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to copy to clipboard."));
    }
  };

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setActionError("Enter a name for this API key.");
      return;
    }

    setCreating(true);
    setActionError(null);
    setSuccess(null);
    try {
      const generated = await api.createApiKey({
        name: trimmedName,
        client,
      });
      setKeys((current) => [
        generated,
        ...current.filter((key) => key.id !== generated.id),
      ]);
      setCreatedKey(generated);
      setName("");
      setSuccess("API key generated.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to generate API key."));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeletingId(target.id);
    setDeleteTarget(null);
    setActionError(null);
    setSuccess(null);
    try {
      await api.revokeApiKey(target.id);
      setKeys((current) => current.filter((key) => key.id !== target.id));
      if (createdKey?.id === target.id) setCreatedKey(null);
      setSuccess(`Revoked "${target.name}".`);
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to revoke API key."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mb-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 bg-violet-50 dark:bg-violet-950/30 rounded-2xl flex items-center justify-center border-2 border-violet-100 dark:border-violet-800/50">
          <KeyRound
            size={28}
            className="text-violet-600 dark:text-violet-400"
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            MCP / API Keys
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-neutral-400">
            Create and manage API keys for external MCP clients. The ExcaliDash
            MCP server is live at <code>/mcp</code> with{" "}
            <strong>25 drawing tools</strong>,{" "}
            <strong>25 auto-discovered MCP prompts</strong> (
            <code>/mcp__excalidash__…</code>), and{" "}
            <strong>25 optional Claude Code skills</strong> you can install
            locally — use a key below as the Bearer token to connect Codex,
            Claude Code, or any MCP client.
          </p>
        </div>
      </div>

      {(loadError || actionError || success) && (
        <div className="mt-5 space-y-2" aria-live="polite">
          {(loadError || actionError) && (
            <div
              role="alert"
              className="p-3 rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm font-bold text-red-700 dark:text-red-300"
            >
              {loadError || actionError}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {success}
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={handleGenerate}
        className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_auto] gap-3 items-end"
      >
        <div>
          <label
            htmlFor="api-key-name"
            className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2"
          >
            Key name
          </label>
          <input
            id="api-key-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            placeholder="Claude Code notebook"
            className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-violet-400"
          />
        </div>
        <div>
          <label
            htmlFor="api-key-client"
            className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2"
          >
            MCP client
          </label>
          <select
            id="api-key-client"
            aria-label="MCP client"
            value={client}
            onChange={(event) =>
              setClient(event.target.value as ApiKeyClient)
            }
            className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none focus:border-violet-400"
          >
            <option value="claude-code">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="other">Other</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-black bg-violet-600 text-white font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0"
        >
          {creating ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <KeyRound size={18} />
          )}
          {creating ? "Generating…" : "Generate API Key"}
        </button>
      </form>

      {createdKey && (
        <div className="mt-6 p-4 sm:p-5 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-amber-900 dark:text-amber-200">
                Copy this token now. It will only be shown once.
              </h3>
              <p className="mt-1 text-sm font-medium text-amber-800 dark:text-amber-300">
                Closing this panel or reloading the page permanently hides the
                full token.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="p-1 text-amber-800 dark:text-amber-200"
              aria-label="Close one-time token"
            >
              <X size={20} />
            </button>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <code className="min-w-0 flex-1 break-all rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-white dark:bg-neutral-900 px-3 py-3 text-sm text-slate-900 dark:text-white">
              {createdKey.token}
            </code>
            <CopyButton
              text={createdKey.token}
              label="Copy API token"
              copied={copiedLabel === "Copy API token"}
              onCopy={copyText}
            />
          </div>
        </div>
      )}

      <div className="mt-7">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Your API keys
        </h3>
        {loading ? (
          <div
            className="mt-3 flex items-center gap-2 p-5 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 text-sm font-bold text-slate-500 dark:text-neutral-400"
            role="status"
          >
            <Loader2 size={18} className="animate-spin" />
            Loading API keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="mt-3 p-6 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 bg-slate-50/60 dark:bg-neutral-800/30 text-center">
            <KeyRound
              size={28}
              className="mx-auto text-slate-400 dark:text-neutral-500"
            />
            <p className="mt-2 font-bold text-slate-800 dark:text-neutral-200">
              No API keys yet
            </p>
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-neutral-400">
              Create your first key to connect ExcaliDash to external MCP
              clients.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {key.name}
                    </p>
                    <span className="px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-[10px] font-black uppercase text-violet-700 dark:text-violet-300">
                      {key.client === "claude-code"
                        ? "Claude Code"
                        : key.client === "codex"
                          ? "Codex"
                        : "Other"}
                    </span>
                  </div>
                  <code className="mt-2 block text-sm font-bold text-slate-700 dark:text-neutral-300">
                    {key.preview}
                  </code>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-slate-500 dark:text-neutral-400">
                    <span>Created {formatDate(key.createdAt)}</span>
                    <span>
                      Last used{" "}
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never used"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(key)}
                  disabled={deletingId === key.id}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-red-200 dark:border-red-800 bg-white dark:bg-neutral-900 text-sm font-bold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
                  aria-label={`Delete key ${key.name}`}
                >
                  {deletingId === key.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  Delete key
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-7 border-t-2 border-slate-100 dark:border-neutral-800 pt-6">
        <div className="flex items-center gap-3">
          {client === "other" ? (
            <Braces
              size={22}
              className="text-violet-600 dark:text-violet-400"
            />
          ) : (
            <Terminal
              size={22}
              className="text-violet-600 dark:text-violet-400"
            />
          )}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              {client === "claude-code"
                ? "Claude Code setup"
                : client === "codex"
                  ? "Codex setup"
                : "Other MCP clients"}
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-neutral-400 break-all">
              MCP URL: {mcpUrl}
            </p>
          </div>
        </div>

        {client === "claude-code" ? (
          <div className="mt-4 space-y-4">
            {claudeCommands.map(({ scope, command }) => (
              <div key={scope}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                    {scope}
                  </span>
                  <CopyButton
                    text={command}
                    label={`Copy ${scope} command`}
                    copied={copiedLabel === `Copy ${scope} command`}
                    onCopy={copyText}
                  />
                </div>
                <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                  <code>{command}</code>
                </pre>
              </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm font-medium text-slate-600 dark:text-neutral-400">
              <p>
                <strong className="text-slate-900 dark:text-white">local:</strong>{" "}
                only this project, private in your ~/.claude.json.
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">
                  project:
                </strong>{" "}
                saves .mcp.json in the repo/project for team sharing. Do not
                commit real tokens.
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">user:</strong>{" "}
                available in all your projects, private in ~/.claude.json.
              </p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-2">
                Useful commands
              </p>
              <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                <code>
                  {"claude mcp list\nclaude mcp get excalidash\nclaude mcp remove excalidash"}
                </code>
              </pre>
            </div>

            <div className="rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/30 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-2">
                After connecting: prompts vs. skills
              </p>
              <p className="text-sm font-medium text-slate-600 dark:text-neutral-400">
                <strong className="text-slate-900 dark:text-white">
                  MCP prompts appear automatically.
                </strong>{" "}
                Once the MCP is added, run <code>/mcp</code> in Claude Code to see
                25 tools and 25 prompts. The prompts show up as commands:{" "}
                <code>/mcp__excalidash__diagram_director</code>,{" "}
                <code>/mcp__excalidash__repo_to_system_design</code>, …
              </p>
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-neutral-400">
                <strong className="text-slate-900 dark:text-white">
                  Claude Code skills must be installed/copied.
                </strong>{" "}
                <code>claude mcp add</code> does <em>not</em> copy local skill
                files into <code>~/.claude/skills</code>. Install the 25 skills
                with:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                <code>
                  {[
                    "# user scope (all projects)",
                    "npx -y @excalidash/claude-skills install --scope user",
                    "",
                    "# project scope (this repo's .claude/skills)",
                    "npx -y @excalidash/claude-skills install --scope project --project-dir .",
                    "",
                    "# local fallback (from this repo, no npm publish needed)",
                    "node packages/excalidash-claude-skills/bin/install.cjs install --scope user",
                    "node packages/excalidash-claude-skills/bin/install.cjs verify",
                  ].join("\n")}
                </code>
              </pre>
            </div>
          </div>
        ) : client === "codex" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-medium text-slate-600 dark:text-neutral-400">
              One command per scope — copy it, paste it, run it. Each command uses{" "}
              <code>codex mcp add</code> to register the server and embeds your API
              key inline as an <code>Authorization</code> header. No{" "}
              <code>export</code>, no environment variable, and no manual{" "}
              <code>config.toml</code> editing.
            </p>

            {codexCommands.map(({ scope, command }) => (
              <div key={scope}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                    {scope}
                  </span>
                  <CopyButton
                    text={command}
                    label={`Copy codex ${scope} command`}
                    copied={copiedLabel === `Copy codex ${scope} command`}
                    onCopy={copyText}
                  />
                </div>
                <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                  <code>{command}</code>
                </pre>
              </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm font-medium text-slate-600 dark:text-neutral-400">
              <p>
                <strong className="text-slate-900 dark:text-white">user:</strong>{" "}
                writes <code>~/.codex/config.toml</code> — available in every
                project.
              </p>
              <p>
                <strong className="text-slate-900 dark:text-white">
                  project:
                </strong>{" "}
                writes <code>./.codex/config.toml</code> in this repo. Codex loads
                it only for <strong>trusted</strong> projects. Do not commit real
                tokens.
              </p>
            </div>

            <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-sm font-medium text-amber-900 dark:text-amber-200">
              <strong>Project scope needs trust.</strong> Codex reads{" "}
              <code>./.codex/config.toml</code> only after you trust the folder.
              Run <code>codex</code> in the project and accept the trust prompt on
              first launch (if you have used Codex here before, it is already
              trusted). User scope (<code>~/.codex/config.toml</code>) needs no
              trust and works in every project.
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400 mb-2">
                Useful commands
              </p>
              <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                <code>{CODEX_USEFUL_COMMANDS}</code>
              </pre>
            </div>

            <details className="rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/30 p-4">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-slate-500 dark:text-neutral-400">
                Advanced: manual config.toml
              </summary>
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-neutral-400">
                Prefer the command above. If you edit <code>config.toml</code> by
                hand, this is the equivalent block — the token lives in an inline{" "}
                <code>http_headers</code> table, never an environment variable.
              </p>
              <div className="mt-3 flex justify-end mb-2">
                <CopyButton
                  text={codexManualToml}
                  label="Copy Codex manual config"
                  buttonText="Copy Codex manual config"
                  copied={copiedLabel === "Copy Codex manual config"}
                  onCopy={copyText}
                />
              </div>
              <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
                <code>{codexManualToml}</code>
              </pre>
            </details>

            <p className="text-sm font-medium text-slate-600 dark:text-neutral-400">
              Start Codex with <code>codex</code>, then run <code>/mcp</code>{" "}
              inside Codex to confirm <code>{CODEX_SERVER_NAME}</code> is enabled
              with its tools available.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex justify-end mb-2">
              <CopyButton
                text={otherClientJson}
                label="Copy MCP JSON"
                copied={copiedLabel === "Copy MCP JSON"}
                onCopy={copyText}
              />
            </div>
            <pre className="overflow-x-auto rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-950 p-4 text-xs text-slate-100">
              <code>{otherClientJson}</code>
            </pre>
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-neutral-400">
              Some MCP clients use "streamable-http" instead of "http" for the
              same HTTP transport. If your client rejects "http", change type
              to "streamable-http". Clients that support eager loading may add{" "}
              <code>"alwaysLoad": true</code> next to <code>url</code> to load
              the server's tools/prompts at startup.
            </p>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-neutral-400">
              This server exposes <strong>25 tools</strong> and{" "}
              <strong>25 prompts</strong> (via <code>prompts/list</code>). The 25
              Claude Code skills are an optional local install — see the Claude
              Code tab.
            </p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Delete API key?"
        message={
          deleteTarget
            ? `This revokes "${deleteTarget.name}" immediately. Any client using it will lose access.`
            : ""
        }
        confirmText="Delete key"
        cancelText="Cancel"
        isDangerous
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
};
