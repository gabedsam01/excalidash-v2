import express from "express";
import { registerRuntimeConfigRoutes } from "./runtimeConfig";
import type { Config } from "../../config";

export type SystemRouteDeps = {
  asyncHandler: <T = void>(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
  getBackendVersion: () => string;
  requireAuth: express.RequestHandler;
  config: Config;
};

export const registerSystemRoutes = (app: express.Express, deps: SystemRouteDeps) => {
  registerRuntimeConfigRoutes(app, deps);
};
