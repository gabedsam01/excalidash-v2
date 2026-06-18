import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { lintScene } from "./lint";
import { scoreScene } from "./score";
import { repairScene } from "./repair";

const loadFixture = (): ExcalidrawScene =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../__testfixtures__/bad-orkestrai-architecture.excalidraw",
      ),
      "utf8",
    ),
  ) as ExcalidrawScene;

const codes = (s: ExcalidrawScene) => new Set(lintScene(s).map((i) => i.code));

const BASE = {
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
  fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1,
  opacity: 100, groupIds: [] as string[], frameId: null as string | null,
  roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false,
  boundElements: null, updated: 1, link: null, locked: false,
};
let n = 0;
const el = (over: Partial<ExcalidrawElement>): ExcalidrawElement => {
  n += 1;
  return { id: over.id ?? `e${n}`, type: "rectangle", x: 0, y: 0, width: 120, height: 60, ...BASE, ...over } as ExcalidrawElement;
};
const scene = (elements: ExcalidrawElement[]): ExcalidrawScene => ({
  type: "excalidraw", version: 2, source: "test", elements,
  appState: { gridSize: 20, viewBackgroundColor: "#ffffff" }, files: {},
});

describe("visual regression — the bad-OrkestrAI fixture", () => {
  it("the fixture is clean by the OLD rules but FAILS now (arrow over text + title overlap)", () => {
    const s = loadFixture();
    const result = scoreScene(s, 95);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(95);
    const blockerTypes = result.hardBlockers.map((b) => b.type);
    expect(blockerTypes).toContain("ARROW_TEXT_INTERSECTION");
    expect(blockerTypes).toContain("FRAME_TITLE_OVERLAP");
    // The arrow-over-text blocker carries real geometric evidence.
    const arrowBlocker = result.hardBlockers.find(
      (b) => b.type === "ARROW_TEXT_INTERSECTION",
    );
    expect(arrowBlocker?.intersectionArea).toBeGreaterThan(0);
    expect(result.mathematicalEvidence.length).toBeGreaterThan(0);
    expect(result.repairPlan.length).toBeGreaterThan(0);
  });

  it("repair clears the hard blockers and raises the score", () => {
    const s = loadFixture();
    const before = scoreScene(s, 95).score;
    const repaired = repairScene(s);
    const after = scoreScene(repaired.scene, 95);
    expect(after.score).toBeGreaterThan(before);
    const found = codes(repaired.scene);
    expect(found.has("ARROW_TEXT_INTERSECTION")).toBe(false);
    expect(found.has("FRAME_TITLE_OVERLAP")).toBe(false);
  });
});

describe("arrow-over-text detection (segment geometry, not bbox)", () => {
  it("flags an arrow whose line crosses a free text label, and repair moves it off", () => {
    const text = el({ id: "lbl", type: "text", x: 80, y: 90, width: 80, height: 20, text: "LLM Proxy", fontSize: 16 });
    const arrow = el({
      id: "a", type: "arrow", x: 120, y: 0, width: 0, height: 200,
      points: [[0, 0], [0, 200]], startBinding: { elementId: "s", focus: 0, gap: 0 },
      endBinding: { elementId: "t", focus: 0, gap: 0 },
    });
    const s = scene([text, arrow]);
    expect(codes(s).has("ARROW_TEXT_INTERSECTION")).toBe(true);
    const repaired = repairScene(s);
    expect(codes(repaired.scene).has("ARROW_TEXT_INTERSECTION")).toBe(false);
  });

  it("does NOT flag an arrow touching the bound label of its own endpoint card", () => {
    const card = el({ id: "c", x: 0, y: 0, width: 160, height: 60, boundElements: [{ id: "t", type: "text" }] });
    const label = el({ id: "t", type: "text", x: 40, y: 20, width: 80, height: 20, text: "API", fontSize: 16, containerId: "c" });
    const arrow = el({
      id: "a", type: "arrow", x: 80, y: 30, width: 0, height: 120, points: [[0, 0], [0, 120]],
      startBinding: { elementId: "c", focus: 0, gap: 0 }, endBinding: { elementId: "d", focus: 0, gap: 0 },
    });
    expect(codes(scene([card, label, arrow])).has("ARROW_TEXT_INTERSECTION")).toBe(false);
  });
});

describe("frame title band protection", () => {
  it("flags content over a titled frame's reserved band", () => {
    const frame = el({ id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200, name: "Zone" });
    const card = el({ id: "c", x: 20, y: 10, width: 160, height: 30 });
    expect(codes(scene([frame, card])).has("FRAME_TITLE_OVERLAP")).toBe(true);
  });

  it("does not flag content that clears the band", () => {
    const frame = el({ id: "f", type: "frame", x: 0, y: 0, width: 300, height: 200, name: "Zone" });
    const card = el({ id: "c", x: 20, y: 60, width: 160, height: 60 });
    expect(codes(scene([frame, card])).has("FRAME_TITLE_OVERLAP")).toBe(false);
  });
});

describe("library-usage gating (only when requested/required)", () => {
  const richScene = scene([
    el({ id: "a", x: 0, y: 0, width: 160, height: 60 }),
    el({ id: "b", x: 0, y: 120, width: 160, height: 60 }),
    el({ id: "c", x: 0, y: 240, width: 160, height: 60 }),
  ]);
  it("does not flag missing library usage by default", () => {
    expect(codes(richScene).has("NO_LIBRARY_USAGE")).toBe(false);
  });
  it("flags missing library usage when requireLibrary is on", () => {
    const issues = lintScene(richScene, { requireLibrary: true, libraryRequiredSeverity: "error" });
    expect(issues.some((i) => i.code === "NO_LIBRARY_USAGE")).toBe(true);
  });
  it("clears once a library item is present", () => {
    const withLib = scene([
      ...richScene.elements,
      el({ id: "icon", type: "image", x: 8, y: 8, width: 24, height: 24, customData: { excalidash: { library: "logos", item: "x" } } } as never),
    ]);
    const issues = lintScene(withLib, { requireLibrary: true, libraryRequiredSeverity: "error" });
    expect(issues.some((i) => i.code === "NO_LIBRARY_USAGE")).toBe(false);
  });
});
