import express from "express";
import { z } from "zod";
import { PrismaClient } from "../generated/client";
import { generateApiKey } from "./service";

const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  client: z.enum(["claude-code", "codex", "other"]).optional(),
});

type ApiKeyRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
  apiKeySecret: string;
};

const serializeApiKey = (apiKey: {
  id: string;
  name: string;
  client: string | null;
  prefix: string;
  suffix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}) => ({
  id: apiKey.id,
  name: apiKey.name,
  client: apiKey.client,
  preview: `${apiKey.prefix}...${apiKey.suffix}`,
  prefix: apiKey.prefix,
  suffix: apiKey.suffix,
  createdAt: apiKey.createdAt,
  lastUsedAt: apiKey.lastUsedAt,
});

const rejectImpersonation = (
  req: express.Request,
  res: express.Response,
): boolean => {
  if (!req.user?.impersonatorId) return false;
  res.status(403).json({
    error: "Forbidden",
    message: "API keys cannot be managed while impersonating another user",
  });
  return true;
};

export const registerApiKeyRoutes = (
  app: express.Express,
  deps: ApiKeyRouteDeps,
) => {
  const { prisma, requireAuth, asyncHandler, apiKeySecret } = deps;

  app.get(
    "/api-keys",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }
      if (rejectImpersonation(req, res)) return;

      const apiKeys = await prisma.apiKey.findMany({
        where: {
          userId: req.user.id,
          revokedAt: null,
        },
        select: {
          id: true,
          name: true,
          client: true,
          prefix: true,
          suffix: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.json(apiKeys.map(serializeApiKey));
    }),
  );

  app.post(
    "/api-keys",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }
      if (rejectImpersonation(req, res)) return;

      const parsed = createApiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Key name must be between 1 and 100 characters",
        });
      }

      const generated = generateApiKey(apiKeySecret);
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: req.user.id,
          name: parsed.data.name,
          client: parsed.data.client ?? null,
          prefix: generated.prefix,
          suffix: generated.suffix,
          tokenHash: generated.tokenHash,
        },
        select: {
          id: true,
          name: true,
          client: true,
          prefix: true,
          suffix: true,
          createdAt: true,
          lastUsedAt: true,
        },
      });

      return res.status(201).json({
        ...serializeApiKey(apiKey),
        token: generated.token,
      });
    }),
  );

  app.delete(
    "/api-keys/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }
      if (rejectImpersonation(req, res)) return;

      const result = await prisma.apiKey.updateMany({
        where: {
          id: req.params.id,
          userId: req.user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        return res.status(404).json({
          error: "Not found",
          message: "API key not found",
        });
      }

      return res.json({ success: true });
    }),
  );
};
