import { describe, expect, it } from "vitest";
import type { ExcalidrawElement } from "../types";
import {
  fitElementsInto,
  normalizeElements,
  slotForPlacement,
  tagItemElements,
} from "./placement";
import { elementBBox, unionBBox } from "../geometry/geometry";
import { isLibraryElement, metaOf } from "./metadata";

const BASE = {
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#fff", fillStyle: "solid",
  strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 50, groupIds: [] as string[],
  frameId: null as string | null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false,
};
const el = (over: Partial<ExcalidrawElement>): ExcalidrawElement =>
  ({ id: "x", type: "rectangle", x: 0, y: 0, width: 100, height: 200, ...BASE, ...over }) as ExcalidrawElement;

describe("library placement + normalization", () => {
  it("fits a tall item into a square slot preserving aspect ratio", () => {
    const item = [el({ id: "a", x: 0, y: 0, width: 100, height: 200 })];
    const fitted = fitElementsInto(item, { x: 500, y: 500, width: 40, height: 40 });
    const box = unionBBox(fitted)!;
    // It must fit inside the slot...
    expect(box.minX).toBeGreaterThanOrEqual(500 - 0.01);
    expect(box.maxX).toBeLessThanOrEqual(540 + 0.01);
    expect(box.maxY).toBeLessThanOrEqual(540 + 0.01);
    // ...and keep its 1:2 aspect ratio.
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    expect(h / w).toBeCloseTo(2, 1);
  });

  it("normalizes opacity to 100 and snaps to grid", () => {
    const out = normalizeElements([el({ x: 17, y: 23, opacity: 50 })], { grid: 20, minFontSize: 16 });
    expect(out[0].opacity).toBe(100);
    expect(out[0].x).toBe(20);
    expect(out[0].y).toBe(20);
  });

  it("computes inside-card and badge slots relative to a card box", () => {
    const card = { minX: 0, minY: 0, maxX: 200, maxY: 80 };
    const left = slotForPlacement(card, "inside-card-left", 28);
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(left.x).toBeLessThan(40);
    const badge = slotForPlacement(card, "badge", 24);
    expect(badge.x).toBeGreaterThan(180); // near the top-right corner
    expect(badge.y).toBeLessThan(20);
  });

  it("tags placed elements so the scene reports real library usage", () => {
    const tagged = tagItemElements([el({ id: "a" })], { library: "logos", item: "AWS", placement: "inside-card-left" });
    expect(isLibraryElement(tagged[0])).toBe(true);
    expect(metaOf(tagged[0])?.library).toBe("logos");
    expect(metaOf(tagged[0])?.role).toBe("icon");
  });

  it("a database-symbol placement tags the database-symbol role", () => {
    const tagged = tagItemElements([el({ id: "a" })], { library: "data", item: "PG", placement: "database-symbol" });
    expect(metaOf(tagged[0])?.role).toBe("database-symbol");
    // Decorative library element keeps its bbox (sanity).
    expect(elementBBox(tagged[0]).maxX).toBeGreaterThan(0);
  });
});
