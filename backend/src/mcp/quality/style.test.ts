import { describe, expect, it } from "vitest";
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { lintScene } from "./lint";
import { scoreIssues, scoreScene } from "./score";
import {
  contrastRatio,
  detectMissingIcon,
  detectStyleDrift,
  detectTypoHierarchy,
  hueFamily,
  parseHex,
  relativeLuminance,
} from "./style";

const BASE = {
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [] as string[],
  frameId: null as string | null,
  roundness: null,
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};
let n = 0;
const el = (over: Partial<ExcalidrawElement>): ExcalidrawElement => {
  n += 1;
  return { id: over.id ?? `e${n}`, type: "rectangle", x: 0, y: 0, width: 160, height: 60, ...BASE, ...over } as ExcalidrawElement;
};
const scene = (elements: ExcalidrawElement[]): ExcalidrawScene => ({
  type: "excalidraw",
  version: 2,
  source: "test",
  elements,
  appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
  files: {},
});

const labeledCard = (
  id: string,
  x: number,
  y: number,
  label: string,
  bg = "#a5d8ff",
): ExcalidrawElement[] => [
  el({ id, x, y, width: 180, height: 60, backgroundColor: bg, boundElements: [{ id: `${id}t`, type: "text" }] }),
  el({ id: `${id}t`, type: "text", x: x + 40, y: y + 20, width: 100, height: 20, text: label, fontSize: 16, containerId: id }),
];

describe("colour math (WCAG)", () => {
  it("computes contrast 21:1 for black on white", () => {
    expect(Math.round(contrastRatio(parseHex("#000000")!, parseHex("#ffffff")!))).toBe(21);
  });
  it("luminance is monotonic", () => {
    expect(relativeLuminance(parseHex("#ffffff")!)).toBeGreaterThan(relativeLuminance(parseHex("#777777")!));
  });
  it("buckets hue families and ignores neutrals", () => {
    expect(hueFamily("#a5d8ff")).not.toBeNull(); // blue
    expect(hueFamily("#b2f2bb")).not.toBeNull(); // green
    expect(hueFamily("#ffffff")).toBeNull(); // neutral
    expect(hueFamily("transparent")).toBeNull();
  });
});

describe("style detectors (gated)", () => {
  it("flags TOO_MANY_COLORS with > 3 hue families", () => {
    const cards = [
      el({ id: "a", x: 0, y: 0, backgroundColor: "#a5d8ff" }), // blue
      el({ id: "b", x: 0, y: 100, backgroundColor: "#b2f2bb" }), // green
      el({ id: "c", x: 0, y: 200, backgroundColor: "#ffec99" }), // yellow
      el({ id: "d", x: 0, y: 300, backgroundColor: "#ffc9c9" }), // red
    ];
    const codes = detectStyleDrift(cards).map((i) => i.code);
    expect(codes).toContain("TOO_MANY_COLORS");
  });

  it("flags STYLE_DRIFT for mixed roughness", () => {
    const cards = [
      el({ id: "a", x: 0, y: 0, roughness: 0, backgroundColor: "#a5d8ff" }),
      el({ id: "b", x: 0, y: 100, roughness: 1, backgroundColor: "#a5d8ff" }),
      el({ id: "c", x: 0, y: 200, roughness: 0, backgroundColor: "#a5d8ff" }),
    ];
    expect(detectStyleDrift(cards).map((i) => i.code)).toContain("STYLE_DRIFT");
  });

  it("does not flag a single-family, single-roughness diagram", () => {
    const cards = [
      el({ id: "a", x: 0, y: 0, backgroundColor: "#a5d8ff" }),
      el({ id: "b", x: 0, y: 100, backgroundColor: "#a5d8ff" }),
      el({ id: "c", x: 0, y: 200, backgroundColor: "#a5d8ff" }),
    ];
    expect(detectStyleDrift(cards)).toEqual([]);
  });

  it("flags LOW_CONTRAST for light text on white via lintScene gate", () => {
    const faint = scene([
      el({ id: "t", type: "text", x: 0, y: 0, width: 80, height: 20, text: "faint", fontSize: 18, strokeColor: "#dddddd" }),
    ]);
    const codes = lintScene(faint, { enforceContrast: true }).map((i) => i.code);
    expect(codes).toContain("LOW_CONTRAST");
    // default (gate off) does not flag it
    expect(lintScene(faint).map((i) => i.code)).not.toContain("LOW_CONTRAST");
  });

  it("flags MISSING_ICON for recognized nodes with no icon, clears once an icon is added", () => {
    const els = [
      ...labeledCard("p", 0, 0, "PostgreSQL"),
      ...labeledCard("r", 0, 120, "Redis"),
      ...labeledCard("a", 0, 240, "API service"),
    ];
    const flagged = detectMissingIcon(els);
    expect(flagged.length).toBe(3);
    expect(flagged.every((i) => i.code === "MISSING_ICON")).toBe(true);

    const withIcon = [
      ...els,
      el({ id: "icon", type: "image", x: 8, y: 8, width: 36, height: 36, customData: { excalidash: { library: "excalidash-bundled", item: "PostgreSQL", role: "icon" } } } as never),
    ];
    expect(detectMissingIcon(withIcon).length).toBe(2);
  });

  it("flags weak typographic hierarchy", () => {
    const weak = [
      el({ id: "t1", type: "text", x: 0, y: 0, width: 80, height: 20, text: "Title", fontSize: 18 }),
      el({ id: "t2", type: "text", x: 0, y: 40, width: 80, height: 20, text: "label", fontSize: 16 }),
      el({ id: "t3", type: "text", x: 0, y: 80, width: 80, height: 20, text: "label2", fontSize: 16 }),
    ];
    expect(detectTypoHierarchy(weak).map((i) => i.code)).toContain("TYPO_HIERARCHY");

    const strong = [
      el({ id: "t1", type: "text", x: 0, y: 0, width: 80, height: 20, text: "Title", fontSize: 28 }),
      el({ id: "t2", type: "text", x: 0, y: 40, width: 80, height: 20, text: "label", fontSize: 16 }),
      el({ id: "t3", type: "text", x: 0, y: 80, width: 80, height: 20, text: "label2", fontSize: 16 }),
    ];
    expect(detectTypoHierarchy(strong)).toEqual([]);
  });
});

describe("minFontSize is 16", () => {
  it("flags 15px text as SMALL_FONT", () => {
    const s = scene([el({ id: "t", type: "text", x: 0, y: 0, width: 40, height: 16, text: "hi", fontSize: 15 })]);
    expect(lintScene(s).map((i) => i.code)).toContain("SMALL_FONT");
  });
  it("does not flag 16px text", () => {
    const s = scene([el({ id: "t", type: "text", x: 0, y: 0, width: 40, height: 16, text: "hi", fontSize: 16 })]);
    expect(lintScene(s).map((i) => i.code)).not.toContain("SMALL_FONT");
  });
});

describe("DIMENSION_WEIGHT folds into the headline score", () => {
  const issue = (dimension: "layout" | "consistency", severity: "warning") => ({
    code: "X",
    severity,
    message: "",
    elementIds: [] as string[],
    dimension,
    repairable: false,
  });

  it("a heavy-dimension penalty moves the score more than a light one", () => {
    const heavy = scoreIssues([issue("layout", "warning")], 95).score; // factor 1.4
    const light = scoreIssues([issue("consistency", "warning")], 95).score; // factor 0.56
    expect(heavy).toBeLessThan(light);
  });

  it("a clean scene still scores 100", () => {
    expect(scoreIssues([], 95).score).toBe(100);
  });
});

describe("architecture gates penalize a bare rectangle-only diagram", () => {
  it("a rectangle-only, icon-less, legend-less architecture cannot reach 95", () => {
    const els = [
      ...labeledCard("p", 0, 0, "PostgreSQL"),
      ...labeledCard("r", 0, 120, "Redis"),
      ...labeledCard("a", 0, 240, "API"),
      ...labeledCard("f", 0, 360, "Frontend"),
    ];
    const archOpts = {
      requireIcons: true,
      requireLegend: true,
      expectRichArchitecture: true,
      enforceStyleTokens: true,
    } as const;
    const result = scoreScene(scene(els), 95, archOpts);
    expect(result.score).toBeLessThan(95);
  });
});
