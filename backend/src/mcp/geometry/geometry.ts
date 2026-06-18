/**
 * Geometry engine — pure math used by lint/score/repair/auto-polish.
 *
 * Validates bounding boxes, rectangle intersection, text/element containment,
 * minimum distance, grid snapping, arrow endpoints, density and viewport.
 */
import type { BBox, ExcalidrawElement } from "../types";

export const SHAPE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
]);
export const LINEAR_TYPES = new Set(["arrow", "line", "draw", "freedraw"]);

export const isShape = (el: ExcalidrawElement): boolean =>
  SHAPE_TYPES.has(el.type);
export const isText = (el: ExcalidrawElement): boolean => el.type === "text";
export const isLinear = (el: ExcalidrawElement): boolean =>
  LINEAR_TYPES.has(el.type);
export const isFrame = (el: ExcalidrawElement): boolean => el.type === "frame";
export const isArrow = (el: ExcalidrawElement): boolean => el.type === "arrow";

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Axis-aligned bounding box of one element (handles linear point geometry). */
export const elementBBox = (el: ExcalidrawElement): BBox => {
  const x = num(el.x);
  const y = num(el.y);
  if (isLinear(el) && Array.isArray(el.points) && el.points.length > 0) {
    const xs = el.points.map((p) => x + num(p[0]));
    const ys = el.points.map((p) => y + num(p[1]));
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  const w = num(el.width);
  const h = num(el.height);
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
};

export const bboxWidth = (b: BBox): number => b.maxX - b.minX;
export const bboxHeight = (b: BBox): number => b.maxY - b.minY;
export const bboxArea = (b: BBox): number =>
  Math.max(0, bboxWidth(b)) * Math.max(0, bboxHeight(b));
export const bboxCenter = (b: BBox): [number, number] => [
  (b.minX + b.maxX) / 2,
  (b.minY + b.maxY) / 2,
];

/** Bounding box enclosing many elements. */
export const unionBBox = (elements: ExcalidrawElement[]): BBox | null => {
  const boxes = elements.map(elementBBox);
  if (boxes.length === 0) return null;
  return boxes.reduce((acc, b) => ({
    minX: Math.min(acc.minX, b.minX),
    minY: Math.min(acc.minY, b.minY),
    maxX: Math.max(acc.maxX, b.maxX),
    maxY: Math.max(acc.maxY, b.maxY),
  }));
};

/** Do two boxes overlap (strictly, with an optional tolerance)? */
export const rectsIntersect = (a: BBox, b: BBox, tolerance = 0): boolean =>
  a.minX < b.maxX - tolerance &&
  a.maxX > b.minX + tolerance &&
  a.minY < b.maxY - tolerance &&
  a.maxY > b.minY + tolerance;

/** Area of the intersection of two boxes (0 if disjoint). */
export const intersectionArea = (a: BBox, b: BBox): number => {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Overlap as a fraction of the smaller box's area (0..1). */
export const overlapRatio = (a: BBox, b: BBox): number => {
  const inter = intersectionArea(a, b);
  if (inter <= 0) return 0;
  const smaller = Math.min(bboxArea(a), bboxArea(b));
  return smaller > 0 ? inter / smaller : 0;
};

/** Is `inner` fully inside `outer` (within padding)? */
export const contains = (outer: BBox, inner: BBox, padding = 0): boolean =>
  inner.minX >= outer.minX + padding &&
  inner.minY >= outer.minY + padding &&
  inner.maxX <= outer.maxX - padding &&
  inner.maxY <= outer.maxY - padding;

/** Fraction of `inner` contained inside `outer` (0..1). */
export const containmentRatio = (outer: BBox, inner: BBox): number => {
  const innerArea = bboxArea(inner);
  if (innerArea <= 0) return 1;
  return intersectionArea(outer, inner) / innerArea;
};

/** Minimum gap between two boxes (0 if they touch or overlap). */
export const gapBetween = (a: BBox, b: BBox): number => {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
};

export const isOnGrid = (value: number, grid: number): boolean =>
  grid <= 0 || Math.abs(value - Math.round(value / grid) * grid) < 0.5;

export const snapToGrid = (value: number, grid: number): number =>
  grid <= 0 ? value : Math.round(value / grid) * grid;

/** Endpoints of a linear element in absolute coordinates. */
export const linearEndpoints = (
  el: ExcalidrawElement,
): { start: [number, number]; end: [number, number] } | null => {
  if (!isLinear(el) || !Array.isArray(el.points) || el.points.length < 2) {
    return null;
  }
  const x = num(el.x);
  const y = num(el.y);
  const first = el.points[0];
  const last = el.points[el.points.length - 1];
  return {
    start: [x + num(first[0]), y + num(first[1])],
    end: [x + num(last[0]), y + num(last[1])],
  };
};

export const pointInBBox = (
  point: [number, number],
  box: BBox,
  padding = 0,
): boolean =>
  point[0] >= box.minX - padding &&
  point[0] <= box.maxX + padding &&
  point[1] >= box.minY - padding &&
  point[1] <= box.maxY + padding;

export type Segment = [[number, number], [number, number]];

/** Absolute line segments of a linear element (arrow/line polyline). */
export const linearSegments = (el: ExcalidrawElement): Segment[] => {
  if (!isLinear(el) || !Array.isArray(el.points) || el.points.length < 2) {
    return [];
  }
  const x = num(el.x);
  const y = num(el.y);
  const pts = el.points.map(
    (p): [number, number] => [x + num(p[0]), y + num(p[1])],
  );
  const segments: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    segments.push([pts[i], pts[i + 1]]);
  }
  return segments;
};

/**
 * Length of the part of segment a→b that lies inside `box`, via Liang–Barsky
 * parametric clipping. 0 if the segment never enters the box. This is the honest
 * geometric primitive behind ARROW_TEXT_INTERSECTION (we measure the real
 * overlap of the arrow's line with the readable text rectangle, not bboxes).
 */
export const segmentRectClipLength = (
  a: [number, number],
  b: [number, number],
  box: BBox,
): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    return pointInBBox(a, box) ? 0 : 0;
  }
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - box.minX, box.maxX - a[0], a[1] - box.minY, box.maxY - a[1]];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return 0; // parallel and outside this edge
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t1 < t0) return 0;
  const len = Math.hypot(dx, dy);
  return Math.max(0, (t1 - t0) * len);
};

/** Does any segment of a linear element pass through `box` (length > min)? */
export const linearCrossesRect = (
  el: ExcalidrawElement,
  box: BBox,
  minLength = 1,
): number => {
  let max = 0;
  for (const [a, b] of linearSegments(el)) {
    max = Math.max(max, segmentRectClipLength(a, b, box));
  }
  return max >= minLength ? max : 0;
};

/** Perpendicular distance from a point to a segment. */
export const pointSegmentDistance = (
  point: [number, number],
  a: [number, number],
  b: [number, number],
): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
};

/** Do two segments properly intersect (used to count arrow crossings)? */
export const segmentsIntersect = (
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean => {
  const o = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
  ): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = o(p3, p4, p1);
  const d2 = o(p3, p4, p2);
  const d3 = o(p1, p2, p3);
  const d4 = o(p1, p2, p4);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
};

/**
 * The rectangle reserved at the top of a frame for its title. Content must not
 * intrude here (FRAME_TITLE_OVERLAP). Excalidraw draws frame names just above
 * the frame; we reserve an inner band too so generated content leaves room.
 */
export const frameTitleBand = (
  frame: ExcalidrawElement,
  bandHeight = 40,
): BBox => {
  const box = elementBBox(frame);
  return {
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.minY + Math.min(bandHeight, Math.max(0, bboxHeight(box))),
  };
};

/**
 * Density of elements per region: returns the maximum count of element centers
 * that fall within any single cell of a regular grid over the scene.
 */
export const maxRegionDensity = (
  elements: ExcalidrawElement[],
  cellSize: number,
): { max: number; cells: number } => {
  const cells = new Map<string, number>();
  for (const el of elements) {
    const [cx, cy] = bboxCenter(elementBBox(el));
    const key = `${Math.floor(cx / cellSize)},${Math.floor(cy / cellSize)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  let max = 0;
  for (const count of cells.values()) max = Math.max(max, count);
  return { max, cells: cells.size };
};

/** Live (non-deleted) elements. */
export const liveElements = (
  elements: ExcalidrawElement[],
): ExcalidrawElement[] => elements.filter((el) => !el.isDeleted);
