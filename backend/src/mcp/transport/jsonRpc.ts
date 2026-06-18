/**
 * Minimal MCP streamable-HTTP transport over JSON-RPC 2.0. No SDK dependency.
 * Supports initialize, notifications/*, ping, tools/list, tools/call,
 * prompts/list and prompts/get (the 25 prompts surface as /mcp__excalidash__*).
 */
import { isMcpToolError } from "../errors";
import type { McpTool, ToolContext } from "../registry/toolRegistry";
import type { McpPrompt } from "../prompts/registry";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface ServerInfo {
  name: string;
  version: string;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

const errorResponse = (
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

const resultResponse = (
  id: string | number | null,
  result: unknown,
): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

/**
 * Handle one JSON-RPC message. Returns undefined for notifications (no `id`),
 * otherwise a JSON-RPC response object.
 */
export const handleMcpMessage = async (
  message: JsonRpcMessage,
  ctx: ToolContext,
  tools: McpTool[],
  serverInfo: ServerInfo,
  prompts: McpPrompt[] = [],
): Promise<JsonRpcResponse | undefined> => {
  const id = message?.id ?? null;
  const isNotification = !message || message.id === undefined;
  const method = message?.method;

  if (isNotification) {
    // notifications/initialized, notifications/cancelled, etc. — no response.
    return undefined;
  }

  if (typeof method !== "string") {
    return errorResponse(id, -32600, "Invalid Request: missing method.");
  }

  switch (method) {
    case "initialize": {
      const requested =
        (message.params?.protocolVersion as string | undefined) ??
        MCP_PROTOCOL_VERSION;
      return resultResponse(id, {
        protocolVersion: requested,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo,
        instructions:
          "Call read_mcp_guide first. Generate → lint → score → repair/auto_polish (min score 95) → save → get_drawing_url. 25 prompts are available as /mcp__excalidash__*.",
      });
    }
    case "ping":
      return resultResponse(id, {});
    case "tools/list":
      return resultResponse(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.jsonSchema,
        })),
      });
    case "prompts/list":
      return resultResponse(id, {
        prompts: prompts.map((p) => ({
          name: p.name,
          title: p.title,
          description: p.description,
          arguments: p.arguments,
        })),
      });
    case "prompts/get": {
      const name = message.params?.name as string | undefined;
      const promptArgs =
        (message.params?.arguments as Record<string, string> | undefined) ?? {};
      const prompt = prompts.find((p) => p.name === name);
      if (!prompt) {
        return errorResponse(id, -32602, `Unknown prompt: ${String(name)}`);
      }
      return resultResponse(id, {
        description: prompt.description,
        messages: prompt.render(promptArgs),
      });
    }
    case "tools/call": {
      const name = message.params?.name as string | undefined;
      const args = (message.params?.arguments as unknown) ?? {};
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return errorResponse(id, -32602, `Unknown tool: ${String(name)}`);
      }
      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return resultResponse(id, {
          content: [
            {
              type: "text",
              text: `Invalid arguments for ${tool.name}: ${parsed.error.issues
                .map((i) => `${i.path.join(".")} ${i.message}`)
                .join("; ")}`,
            },
          ],
          isError: true,
        });
      }
      try {
        const result = await tool.handler(parsed.data, ctx);
        return resultResponse(id, result);
      } catch (error) {
        const message =
          isMcpToolError(error) && error.message
            ? error.message
            : "Internal tool error.";
        if (!isMcpToolError(error)) {
          console.error(`[mcp] tool ${tool.name} failed:`, error);
        }
        return resultResponse(id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
    }
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
};
