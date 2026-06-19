import { describe, expect, it } from "vitest";

import {
  iconElements,
  normalizeLabel,
  resolveConcept,
  resolveConceptCandidates,
} from "./conceptIndex";
import { BUNDLED_LIBRARY_ID } from "./bundled";

describe("conceptIndex.resolveConcept", () => {
  it("resolves postgres to a real bundled glyph", () => {
    const c = resolveConcept("PostgreSQL 16 :5432");
    expect(c).not.toBeNull();
    expect(c!.iconId).toBe("postgres");
    expect(c!.itemName).toBe("PostgreSQL");
    expect(c!.provenance).toBe("bundled");
    expect(c!.libraryId).toBe(BUNDLED_LIBRARY_ID);
    expect(iconElements(c!.iconId).length).toBeGreaterThan(0);
  });

  it("resolves redis to a real bundled glyph", () => {
    const c = resolveConcept("Redis 7 :6379");
    expect(c?.iconId).toBe("redis");
    expect(iconElements("redis").length).toBeGreaterThan(0);
  });

  it("prefers the specific brand over the generic concept", () => {
    expect(resolveConcept("API · NestJS :3001")?.iconId).toBe("nestjs");
    expect(resolveConcept("Primary database (Postgres)")?.iconId).toBe("postgres");
    expect(resolveConcept("Next.js web app :3000")?.iconId).toBe("nextjs");
  });

  it("gives api / backend / frontend a coherent fallback", () => {
    expect(resolveConcept("API Gateway")).not.toBeNull();
    expect(resolveConcept("Backend service")?.iconId).toBe("backend");
    expect(resolveConcept("Frontend")?.iconId).toBe("frontend");
    expect(resolveConcept("Web")?.iconId).toBe("web");
  });

  it("resolves cache / queue / worker / auth / user", () => {
    expect(resolveConcept("Cache layer")?.iconId).toBe("cache");
    expect(resolveConcept("Message queue")?.iconId).toBe("queue");
    expect(resolveConcept("Background worker")?.iconId).toBe("worker");
    expect(resolveConcept("Auth service")?.iconId).toBe("auth");
    expect(resolveConcept("User")?.iconId).toBe("user");
    expect(resolveConcept("Docker")?.iconId).toBe("docker");
    expect(resolveConcept("PgBouncer :6432")?.iconId).toBe("pgbouncer");
  });

  it("returns null for an unrecognized label without throwing", () => {
    expect(resolveConcept("Visitante público")).toBeNull();
    expect(resolveConcept("")).toBeNull();
    expect(resolveConcept("   ")).toBeNull();
    expect(resolveConcept("lorem ipsum dolor")).toBeNull();
  });

  it("ranks candidates best-first and tags bundled provenance", () => {
    const candidates = resolveConceptCandidates("Postgres database");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].iconId).toBe("postgres");
    expect(candidates.every((c) => c.provenance === "bundled")).toBe(true);
    // scores are descending
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it("normalizes accents and punctuation", () => {
    expect(normalizeLabel("API · NestJS :3001")).toBe("api nestjs 3001");
    expect(normalizeLabel("Próximo-Serviço")).toBe("proximo servico");
  });

  it("produces well-formed glyph elements (ids, groupIds, variety)", () => {
    const els = iconElements("postgres");
    expect(els.length).toBeGreaterThanOrEqual(2);
    for (const el of els) {
      expect(typeof el.id).toBe("string");
      expect(Array.isArray(el.groupIds)).toBe(true);
      expect(typeof el.type).toBe("string");
    }
    // a glyph is not a single bare rectangle
    const types = new Set(els.map((e) => e.type));
    expect(types.size).toBeGreaterThanOrEqual(1);
    expect(iconElements("unknown-id")).toEqual([]);
  });
});
