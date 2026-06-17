import express from "express";
import multer from "multer";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../config";
import { errorHandler } from "./errorHandler";

describe("payload-too-large error handling", () => {
  it("returns a structured 413 for Multer file-size errors", async () => {
    const app = express();
    app.post("/upload", (_req, _res, next) => {
      next(new multer.MulterError("LIMIT_FILE_SIZE", "archive"));
    });
    app.use(errorHandler);

    const response = await request(app).post("/upload");

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "Payload too large",
      message: "The uploaded file exceeds the configured limit.",
      limitMb: config.limits.upload.mb,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("returns a structured 413 for body-parser errors", async () => {
    const app = express();
    app.use(express.json({ limit: "1kb" }));
    app.post("/json", (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const response = await request(app)
      .post("/json")
      .set("Content-Type", "application/json")
      .send({ data: "x".repeat(2_000) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "Payload too large",
      message: "The request body exceeds the configured limit.",
      limitMb: 0.000977,
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
