import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  ImportPayloadTooLargeError,
  respondToImportError,
} from "./shared";

describe("import payload limit responses", () => {
  it("returns a structured 413 for import-specific size limits", async () => {
    const app = express();
    app.get("/import", (_req, res) =>
      respondToImportError(
        res,
        new ImportPayloadTooLargeError(
          "The extracted backup contents exceed the configured limit.",
          500,
        ),
        "Invalid backup",
      ),
    );

    const response = await request(app).get("/import");

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      error: "Payload too large",
      message: "The extracted backup contents exceed the configured limit.",
      limitMb: 500,
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
