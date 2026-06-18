/**
 * Library item normalization + placement. Turns raw library elements into
 * canvas-consistent icons that sit in reserved slots (inside a card, as a badge,
 * in a legend, as an actor/database/cloud symbol) — normalized for scale,
 * aspect ratio, stroke, fill, opacity, grid and group, and tagged with
 * provenance metadata. Pure functions (no I/O) so they are unit-testable.
 */
import type { BBox, ExcalidrawElement } from "../types";
import { elementBBox, snapToGrid, unionBBox } from "../geometry/geometry";
import { tagElement, type ElementRole } from "./metadata";

export type Placement =
  | "grid"
  | "inside-card-left"
  | "inside-card-top"
  | "badge"
  | "legend"
  | "actor"
  | "database-symbol"
  | "cloud-provider"
  | "external-integration-card";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PLACEMENT_ROLE: Partial<Record<Placement, ElementRole>> = {
  "inside-card-left": "icon",
  "inside-card-top": "icon",
  badge: "badge",
  legend: "legend-item",
  actor: "actor",
  "database-symbol": "database-symbol",
  "cloud-provider": "cloud-provider",
};

const numOf = (v: unknown, f = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : f;

/**
 * Uniformly scale a group of elements (preserving aspect ratio) to fit `rect`,
 * centered within it. Scales geometry, polyline points and font sizes.
 */
export const fitElementsInto = (
  elements: ExcalidrawElement[],
  rect: Rect,
  padding = 4,
): ExcalidrawElement[] => {
  const box = unionBBox(elements);
  if (!box) return elements;
  const bw = Math.max(1, box.maxX - box.minX);
  const bh = Math.max(1, box.maxY - box.minY);
  const availW = Math.max(1, rect.width - padding * 2);
  const availH = Math.max(1, rect.height - padding * 2);
  const scale = Math.min(availW / bw, availH / bh, 8);
  const offsetX = rect.x + padding + (availW - bw * scale) / 2;
  const offsetY = rect.y + padding + (availH - bh * scale) / 2;
  return elements.map((original) => {
    const el: ExcalidrawElement = { ...original };
    el.x = offsetX + (numOf(el.x) - box.minX) * scale;
    el.y = offsetY + (numOf(el.y) - box.minY) * scale;
    if (typeof el.width === "number") el.width = el.width * scale;
    if (typeof el.height === "number") el.height = el.height * scale;
    if (Array.isArray(el.points)) {
      el.points = el.points.map(
        (p): [number, number] => [numOf(p[0]) * scale, numOf(p[1]) * scale],
      );
    }
    if (typeof el.fontSize === "number") {
      el.fontSize = Math.max(8, el.fontSize * scale);
    }
    return el;
  });
};

export interface NormalizeOptions {
  grid: number;
  minFontSize: number;
  opacity?: number;
  strokeColor?: string;
  /** When true, recolor mono strokes to the canvas stroke (kept off for logos). */
  recolorStroke?: boolean;
}

/** Normalize scale-independent visual props and snap to grid. */
export const normalizeElements = (
  elements: ExcalidrawElement[],
  opts: NormalizeOptions,
): ExcalidrawElement[] =>
  elements.map((original) => {
    const el: ExcalidrawElement = { ...original };
    if (typeof el.x === "number") el.x = snapToGrid(el.x, opts.grid);
    if (typeof el.y === "number") el.y = snapToGrid(el.y, opts.grid);
    el.opacity = opts.opacity ?? 100;
    if (
      opts.recolorStroke &&
      opts.strokeColor &&
      typeof el.strokeColor === "string"
    ) {
      el.strokeColor = opts.strokeColor;
    }
    if (el.type === "text") {
      const fs = typeof el.fontSize === "number" ? el.fontSize : 20;
      if (fs < opts.minFontSize) el.fontSize = opts.minFontSize;
    }
    return el;
  });

/** The reserved rectangle for an icon given a placement and a target card box. */
export const slotForPlacement = (
  card: BBox,
  placement: Placement,
  slotSize: number,
): Rect => {
  const pad = 8;
  switch (placement) {
    case "inside-card-left":
      return {
        x: card.minX + pad,
        y: (card.minY + card.maxY) / 2 - slotSize / 2,
        width: slotSize,
        height: slotSize,
      };
    case "inside-card-top":
      return {
        x: (card.minX + card.maxX) / 2 - slotSize / 2,
        y: card.minY + pad,
        width: slotSize,
        height: slotSize,
      };
    case "badge":
      return {
        x: card.maxX - slotSize / 2,
        y: card.minY - slotSize / 2,
        width: slotSize,
        height: slotSize,
      };
    default:
      return { x: card.minX, y: card.minY, width: slotSize, height: slotSize };
  }
};

/** Tag every element of a placed item with provenance + role metadata. */
export const tagItemElements = (
  elements: ExcalidrawElement[],
  meta: { library: string; item: string; placement: Placement },
): ExcalidrawElement[] => {
  const role = PLACEMENT_ROLE[meta.placement];
  return elements.map((el) =>
    tagElement(el, {
      library: meta.library,
      item: meta.item,
      placement: meta.placement,
      ...(role ? { role } : {}),
    }),
  );
};

export const cardBoxById = (
  elements: ExcalidrawElement[],
  cardId: string,
): BBox | null => {
  const card = elements.find((el) => el.id === cardId);
  return card ? elementBBox(card) : null;
};
