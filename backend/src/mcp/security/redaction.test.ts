import { describe, expect, it } from "vitest";
import {
  redactString,
  redactScene,
  redactValue,
  containsSecret,
} from "./redaction";
import type { ExcalidrawScene } from "../types";

describe("secret redaction", () => {
  it("redacts JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N";
    expect(redactString(jwt)).toBe("[REDACTED_JWT]");
  });
  it("redacts bearer tokens", () => {
    expect(redactString("Authorization: Bearer exd_abcdef1234567890")).toContain("Bearer [REDACTED_TOKEN]");
  });
  it("redacts database credentials in URLs", () => {
    expect(redactString("postgres://user:s3cretPass@db.host:5432/app")).toContain("[REDACTED_DB_CREDENTIALS]");
  });
  it("redacts provider keys and webhook secrets", () => {
    expect(redactString("sk_live_abcdefg123456789")).toBe("[REDACTED_PROVIDER_KEY]");
    expect(redactString("whsec_abcdefg123456789")).toBe("[REDACTED_WEBHOOK_SECRET]");
  });
  it("redacts NAME=value secret assignments with a typed placeholder", () => {
    expect(redactString("PROXY_SECRET=supersecretvalue")).toBe("PROXY_SECRET=[REDACTED_PROXY_SECRET]");
    expect(redactString("service_role_key=eyJrole.def.ghijklmn")).toContain("[REDACTED");
  });
  it("does NOT touch ordinary labels", () => {
    expect(redactString("PostgreSQL Database")).toBe("PostgreSQL Database");
    expect(redactString("API Gateway")).toBe("API Gateway");
    expect(containsSecret("Conversations API")).toBe(false);
  });
  it("redacts text-bearing element fields in a scene", () => {
    const scene: ExcalidrawScene = {
      type: "excalidraw", version: 2, source: "t",
      elements: [
        { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "token=ghp_abcdefghijklmnopqrst1234", originalText: "x" } as never,
      ],
      appState: {}, files: {},
    };
    const out = redactScene(scene);
    expect(String((out.elements[0] as { text: string }).text)).not.toContain("ghp_");
  });
  it("redacts nested structured data", () => {
    const out = redactValue({ a: { b: "Bearer sk-proj-abcdefghijklmnopqrstuvwxyz" } }) as { a: { b: string } };
    expect(out.a.b).toContain("Bearer [REDACTED_TOKEN]");
  });
});
