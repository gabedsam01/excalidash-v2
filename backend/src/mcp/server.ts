/**
 * registerMcpServer — wires the MCP transport, auth, rate limiting and the
 * 27-tool registry onto the Express app at config.mcp.endpointPath (`/mcp`).
 *
 * Mounted BEFORE the CSRF middleware in index.ts: `/mcp` is Bearer-authenticated
 * (no cookies), so it must not be subject to cookie-based CSRF.
 */
import express from "express";
import rateLimit from "express-rate-limit";
import { sanitizeDrawingData } from "../security";
import { redactDrawingData } from "./security/redaction";
import type { LibraryConfig } from "../libraries/types";
import type { McpConfig } from "./types";
import type { SnapshotConfig } from "../config";
import { createDrawingService } from "./drawings/drawingService";
import { getCache } from "../cache/cacheService";
import { createLibraryAdapter } from "./libraries/libraryAdapter";
import { buildToolRegistry, type ToolContext } from "./registry/toolRegistry";
import { buildPromptRegistry } from "./prompts/registry";
import {
  createMcpAuthMiddleware,
  createMcpOriginMiddleware,
  type McpRequest,
} from "./auth/mcpAuth";
import { handleMcpMessage, type ServerInfo } from "./transport/jsonRpc";

export interface RegisterMcpDeps {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  prisma: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  config: {
    mcp: McpConfig;
    libraries: LibraryConfig;
    frontendUrl?: string;
    apiKeySecret: string;
    snapshots: SnapshotConfig;
  };
  isAllowedOrigin: (origin?: string) => boolean;
  serverVersion: string;
}

const pickFrontendBaseUrl = (frontendUrl?: string): string | null => {
  if (!frontendUrl) return null;
  const origins = frontendUrl
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length === 0) return null;
  return origins.find((o) => /^https:\/\//i.test(o)) ?? origins[0];
};

export const registerMcpServer = (
  app: express.Express,
  deps: RegisterMcpDeps,
): void => {
  const { prisma, config, isAllowedOrigin, serverVersion } = deps;
  const mcp = config.mcp;
  const endpoint = mcp.endpointPath;

  const tools = buildToolRegistry();
  const prompts = buildPromptRegistry();
  const serverInfo: ServerInfo = {
    name: "excalidash",
    version: serverVersion,
  };

  const drawingService = createDrawingService({
    prisma,
    frontendBaseUrl: pickFrontendBaseUrl(config.frontendUrl),
    maxElements: mcp.maxElements,
    retention: {
      maxPerDrawing: config.snapshots.maxPerDrawing,
      pruneOnSave: config.snapshots.pruneOnSave,
    },
    onDrawingChanged: ({ userId, drawingId }) => {
      // Keep the REST hot-drawing + listing caches consistent after MCP writes.
      void getCache().invalidateDrawing(drawingId);
      void getCache().invalidateUserListings(userId);
    },
    sanitizeScene: (data) =>
      sanitizeDrawingData(
        redactDrawingData(
          data as Parameters<typeof sanitizeDrawingData>[0],
        ),
      ) as ReturnType<
        Parameters<typeof createDrawingService>[0]["sanitizeScene"]
      >,
  });

  const limiter = rateLimit({
    windowMs: Math.max(1, mcp.rateLimitWindowSeconds) * 1000,
    max: mcp.rateLimitMax,
    message: {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32029, message: "MCP rate limit exceeded." },
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });

  const originMiddleware = createMcpOriginMiddleware({
    validateOrigin: mcp.validateOrigin,
    isAllowedOrigin,
  });
  const authMiddleware = createMcpAuthMiddleware({
    prisma,
    apiKeySecret: config.apiKeySecret,
  });

  app.post(
    endpoint,
    limiter,
    originMiddleware,
    authMiddleware,
    async (req: express.Request, res: express.Response) => {
      if (!mcp.enabled) {
        res
          .status(503)
          .json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "MCP is disabled." } });
        return;
      }
      const principal = (req as McpRequest).mcpPrincipal;
      if (!principal) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const ctx: ToolContext = {
        principal,
        config: mcp,
        drawingService,
        libraryAdapter: createLibraryAdapter({
          prisma,
          userId: principal.userId,
        }),
      };

      const body = req.body;
      res.setHeader("Content-Type", "application/json");

      if (body === undefined || body === null || body === "") {
        res.status(400).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error: empty body." },
        });
        return;
      }

      try {
        if (Array.isArray(body)) {
          const responses = (
            await Promise.all(
              body.map((m) => handleMcpMessage(m, ctx, tools, serverInfo, prompts)),
            )
          ).filter((r) => r !== undefined);
          if (responses.length === 0) {
            res.status(202).end();
            return;
          }
          res.json(responses);
          return;
        }
        const response = await handleMcpMessage(body, ctx, tools, serverInfo, prompts);
        if (response === undefined) {
          res.status(202).end();
          return;
        }
        res.json(response);
      } catch (error) {
        console.error("[mcp] request handling failed:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "Internal error." },
        });
      }
    },
  );

  // GET/SSE server-initiated stream is not offered; respond per spec.
  app.get(endpoint, originMiddleware, authMiddleware, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Use POST for the MCP endpoint." },
    });
  });

  console.log(
    `[mcp] ExcaliDash MCP ready at ${endpoint} (${tools.length} tools, enabled=${mcp.enabled})`,
  );
};

export { buildToolRegistry };
