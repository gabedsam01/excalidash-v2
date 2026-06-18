import { describe, expect, it } from "vitest";
import { buildFromRepoAnalysis } from "./patterns";
import { scoreScene } from "../quality/score";
import { isLegendElement } from "../libraries/metadata";

const ORKESTRAI = {
  name: "OrkestrAI",
  actors: ["End User", "Admin"],
  apps: ["Web Frontend (Next.js)"],
  gateways: ["API Gateway"],
  auth: ["Auth (JWT, service_role_key=eyJabc.def.ghijklmn)"],
  services: ["Conversations API", "LLM Proxy", "Billing API"],
  workers: ["BullMQ Worker"],
  queues: ["Redis / BullMQ"],
  databases: ["Supabase / Postgres"],
  integrations: ["Meta WhatsApp", "Stripe", "OpenAI", "Anthropic"],
  observability: ["Logs", "Metrics"],
  risks: ["PROXY_SECRET=supersecretvalue leaked", "No rate limit on /chat"],
  flows: [{ from: "Conversations API", to: "LLM Proxy", label: "proxy" }],
};

describe("create_from_repo_analysis (rich model)", () => {
  it("never stubs — produces a real framed, legended scene", () => {
    const scene = buildFromRepoAnalysis(ORKESTRAI);
    expect(scene.elements.length).toBeGreaterThan(20);
    const frames = scene.elements.filter((e) => e.type === "frame");
    expect(frames.length).toBeGreaterThan(3);
    expect(scene.elements.some(isLegendElement)).toBe(true);
    // Uses richer types than just text/rectangle/arrow/frame? At minimum frames.
    const types = new Set(scene.elements.map((e) => e.type));
    expect(types.has("frame")).toBe(true);
    expect(types.has("arrow")).toBe(true);
  });

  it("passes the quality bar (>= 95, no hard blockers)", () => {
    const result = scoreScene(buildFromRepoAnalysis(ORKESTRAI), 95);
    expect(result.hardBlockers).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.passed).toBe(true);
  });

  it("leaks no secret from the analysis into the drawing", () => {
    const json = JSON.stringify(buildFromRepoAnalysis(ORKESTRAI));
    expect(json).not.toMatch(/eyJabc|supersecretvalue|service_role_key=eyJ/);
    expect(json).toContain("REDACTED");
  });

  it("tolerates a near-empty analysis without crashing", () => {
    const scene = buildFromRepoAnalysis({ name: "Tiny" });
    expect(scene.elements.length).toBeGreaterThan(0);
  });
});
