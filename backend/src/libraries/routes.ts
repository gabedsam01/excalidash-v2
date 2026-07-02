/**
 * Compatibility routes for the removed curated-library subsystem.
 *
 * `/library` remains the user-owned personal library endpoint used by the
 * editor. These `/libraries/*` endpoints used to expose curated/public packs;
 * they now return disabled/empty responses so old clients fail safely without
 * reseeding catalog data.
 */
import express from "express";
import type { LibraryServices } from "./index";

export interface RegisterLibraryRoutesDeps {
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
  services: LibraryServices;
  logger?: Pick<Console, "warn" | "info" | "error">;
}

const DISABLED_MESSAGE =
  "Curated Excalidraw libraries are disabled. Use the personal `/library` templates saved by the user.";

export const registerLibraryRoutes = (
  app: express.Express,
  deps: RegisterLibraryRoutesDeps,
): void => {
  const { requireAuth, asyncHandler } = deps;

  app.get(
    "/libraries/status",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.json({
        catalogCount: 0,
        curatedCount: 0,
        lastRefreshedAt: null,
        cacheDir: "",
        publicSearchEnabled: false,
        refreshIntervalHours: 0,
        autoRefreshOnStart: false,
        disabled: true,
        message: DISABLED_MESSAGE,
      }),
    ),
  );

  app.post(
    "/libraries/refresh",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.status(410).json({
        error: "Curated libraries disabled",
        message: DISABLED_MESSAGE,
      }),
    ),
  );

  app.get(
    "/libraries/packs",
    requireAuth,
    asyncHandler(async (_req, res) => res.json({ core: null, specialized: null })),
  );

  app.get(
    "/libraries/search",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.json({
        mode: "all",
        query: "",
        category: null,
        publicSearchEnabled: false,
        count: 0,
        results: [],
        warning: DISABLED_MESSAGE,
      }),
    ),
  );

  app.get(
    "/libraries/:id",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.status(404).json({
        error: "Not found",
        message: DISABLED_MESSAGE,
      }),
    ),
  );

  app.post(
    "/libraries/:id/cache",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.status(410).json({
        error: "Curated libraries disabled",
        message: DISABLED_MESSAGE,
      }),
    ),
  );

  app.get(
    "/libraries/:id/items",
    requireAuth,
    asyncHandler(async (_req, res) =>
      res.status(410).json({
        error: "Curated libraries disabled",
        message: DISABLED_MESSAGE,
      }),
    ),
  );
};
