/**
 * Error handling middleware
 * Sanitizes error messages in production to prevent information leakage
 */
import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { config } from "../config";
import { bytesToMb } from "../utils/limits";

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  type?: string;
  limit?: number;
  isOperational?: boolean;
}

const sendPayloadTooLarge = (
  res: Response,
  message: string,
  limitMb: number,
): void => {
  res.status(413).json({
    error: "Payload too large",
    message,
    limitMb,
    code: "PAYLOAD_TOO_LARGE",
  });
};

/**
 * Error handler middleware
 * Should be added last in the middleware chain
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (
    err instanceof multer.MulterError &&
    err.code === "LIMIT_FILE_SIZE"
  ) {
    console.warn("[upload] File rejected because it exceeds MAX_UPLOAD_MB", {
      path: req.path,
      method: req.method,
      limitMb: config.limits.upload.mb,
    });
    sendPayloadTooLarge(
      res,
      "The uploaded file exceeds the configured limit.",
      config.limits.upload.mb,
    );
    return;
  }

  if (err.type === "entity.too.large") {
    const configuredLimit =
      req.is("application/x-www-form-urlencoded")
        ? config.limits.urlencodedBody
        : config.limits.jsonBody;
    const limitMb =
      typeof err.limit === "number" && Number.isFinite(err.limit)
        ? bytesToMb(err.limit)
        : configuredLimit.mb;

    console.warn("[upload] Request body rejected because it is too large", {
      path: req.path,
      method: req.method,
      limitMb,
    });
    sendPayloadTooLarge(
      res,
      "The request body exceeds the configured limit.",
      limitMb,
    );
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const isDevelopment = config.nodeEnv === "development";

  console.error("Error:", {
    message: err.message,
    ...(isDevelopment ? { stack: err.stack } : {}),
    statusCode,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  if (!isDevelopment) {
    if (statusCode >= 500) {
      res.status(statusCode).json({
        error: "Internal server error",
        message: "An error occurred while processing your request",
      });
      return;
    }

    res.status(statusCode).json({
      error: "Request error",
      message: err.isOperational ? err.message : "Invalid request",
    });
    return;
  }

  res.status(statusCode).json({
    error: err.message,
    stack: err.stack,
    statusCode,
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = <T = void>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create an operational error (known error that can be safely shown to client)
 */
export const createError = (
  message: string,
  statusCode: number = 400
): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
