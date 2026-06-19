import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "../middleware/errorHandler";
import { registerApiKeyRoutes } from "./routes";

const API_KEY_SECRET = "test-api-key-secret-at-least-32-characters";
const CREATED_AT = new Date("2026-06-18T10:00:00.000Z");

const buildApp = () => {
  const prisma = {
    apiKey: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const app = express();
  app.use(express.json());
  const requireAuth = ((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const userId = String(req.headers["x-test-user"] || "user-1");
    req.user = {
      id: userId,
      email: `${userId}@example.com`,
      name: userId,
      role: "USER",
    };
    next();
  }) as express.RequestHandler;

  registerApiKeyRoutes(app, {
    prisma: prisma as any,
    requireAuth,
    asyncHandler,
    apiKeySecret: API_KEY_SECRET,
  });

  return { app, prisma };
};

describe("API key routes", () => {
  it("lists only active keys owned by the authenticated user", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: "key-1",
        name: "Claude Code notebook",
        client: "claude-code",
        prefix: "exd_0123456789abcdef",
        suffix: "wxyz",
        createdAt: CREATED_AT,
        lastUsedAt: null,
      },
    ]);

    const response = await request(app)
      .get("/api-keys")
      .set("x-test-user", "user-a");

    expect(response.status).toBe(200);
    expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-a",
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
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "key-1",
        preview: "exd_0123456789abcdef...wxyz",
        prefix: "exd_0123456789abcdef",
        suffix: "wxyz",
        lastUsedAt: null,
      }),
    ]);
    expect(response.body[0]).not.toHaveProperty("token");
    expect(response.body[0]).not.toHaveProperty("tokenHash");
  });

  it("returns the raw token only from creation and never stores it", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: "key-created",
      name: data.name,
      client: data.client,
      prefix: data.prefix,
      suffix: data.suffix,
      createdAt: CREATED_AT,
      lastUsedAt: null,
    }));

    const createResponse = await request(app)
      .post("/api-keys")
      .set("x-test-user", "user-a")
      .send({
        name: "Claude Code notebook",
        client: "claude-code",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.token).toMatch(
      /^exd_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/,
    );
    expect(createResponse.body.preview).toBe(
      `${createResponse.body.prefix}...${createResponse.body.suffix}`,
    );

    const createCall = prisma.apiKey.create.mock.calls[0]?.[0] as any;
    expect(createCall.data.userId).toBe("user-a");
    expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createCall.data.tokenHash).not.toBe(createResponse.body.token);
    expect(JSON.stringify(createCall.data)).not.toContain(
      createResponse.body.token,
    );

    prisma.apiKey.findMany.mockResolvedValue([
      {
        id: "key-created",
        name: createResponse.body.name,
        client: createResponse.body.client,
        prefix: createResponse.body.prefix,
        suffix: createResponse.body.suffix,
        createdAt: CREATED_AT,
        lastUsedAt: null,
      },
    ]);
    const getResponse = await request(app)
      .get("/api-keys")
      .set("x-test-user", "user-a");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body[0]).not.toHaveProperty("token");
    expect(JSON.stringify(getResponse.body)).not.toContain(
      createResponse.body.token,
    );
  });

  it("accepts Codex as API key client metadata", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: "key-codex",
      name: data.name,
      client: data.client,
      prefix: data.prefix,
      suffix: data.suffix,
      createdAt: CREATED_AT,
      lastUsedAt: null,
    }));

    const response = await request(app)
      .post("/api-keys")
      .set("x-test-user", "user-a")
      .send({
        name: "Codex",
        client: "codex",
      });

    expect(response.status).toBe(201);
    expect(response.body.client).toBe("codex");
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client: "codex",
        }),
      }),
    );
  });

  it("soft-revokes an owned key so it is excluded from active listings", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
    prisma.apiKey.findMany.mockResolvedValue([]);

    const deleteResponse = await request(app)
      .delete("/api-keys/key-1")
      .set("x-test-user", "user-a");

    expect(deleteResponse.status).toBe(200);
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: {
        id: "key-1",
        userId: "user-a",
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    const listResponse = await request(app)
      .get("/api-keys")
      .set("x-test-user", "user-a");
    expect(listResponse.body).toEqual([]);
  });

  it("does not allow user A to revoke user B's key", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.updateMany.mockImplementation(async ({ where }: any) => ({
      count:
        where.id === "key-owned-by-b" && where.userId === "user-b" ? 1 : 0,
    }));

    const response = await request(app)
      .delete("/api-keys/key-owned-by-b")
      .set("x-test-user", "user-a");

    expect(response.status).toBe(404);
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "key-owned-by-b",
          userId: "user-a",
        }),
      }),
    );
  });
});
