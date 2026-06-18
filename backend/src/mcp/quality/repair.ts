/**
 * repair_drawing — apply deterministic, geometry-driven fixes for repairable
 * issues. Non-destructive: operates on a deep clone and reports what changed.
 */
import type { BBox, ExcalidrawElement, ExcalidrawScene } from "../types";
import { measureText } from "../excalidraw/elements";
import {
  bboxCenter,
  bboxHeight,
  bboxWidth,
  elementBBox,
  frameTitleBand,
  isFrame,
  isShape,
  isText,
  linearCrossesRect,
  linearSegments,
  liveElements,
  overlapRatio,
  snapToGrid,
} from "../geometry/geometry";
import { lintScene, resolveLintOptions, type LintOptions } from "./lint";

const num = (v: unknown, f = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : f;

const cloneScene = (scene: ExcalidrawScene): ExcalidrawScene =>
  JSON.parse(JSON.stringify(scene)) as ExcalidrawScene;

const recenterBoundText = (
  container: ExcalidrawElement,
  elements: ExcalidrawElement[],
): void => {
  for (const el of elements) {
    if (el.type !== "text" || el.containerId !== container.id) continue;
    const metrics = measureText(
      String(el.text ?? ""),
      num(el.fontSize, 16),
      num(el.fontFamily, 2),
    );
    el.width = metrics.width;
    el.height = metrics.height;
    el.x = num(container.x) + (num(container.width) - metrics.width) / 2;
    el.y = num(container.y) + (num(container.height) - metrics.height) / 2;
  }
};

export interface RepairResult {
  scene: ExcalidrawScene;
  applied: string[];
}

/** Apply one repair pass. The auto-polish loop re-runs this to convergence. */
export const repairScene = (
  scene: ExcalidrawScene,
  overrides: Partial<LintOptions> = {},
): RepairResult => {
  const next = cloneScene(scene);
  const opts = resolveLintOptions(next, overrides);
  const elements = liveElements(next.elements);
  const byId = new Map(elements.map((el) => [el.id, el]));
  const issues = lintScene(next, overrides);
  const applied = new Set<string>();

  // 1. Fonts first (affects text metrics used by later fixers).
  for (const issue of issues.filter((i) => i.code === "SMALL_FONT")) {
    const el = byId.get(issue.elementIds[0]);
    if (!el) continue;
    el.fontSize = opts.minFontSize;
    const metrics = measureText(
      String(el.text ?? ""),
      opts.minFontSize,
      num(el.fontFamily, 2),
    );
    el.width = metrics.width;
    el.height = metrics.height;
    if (el.containerId) {
      const container = byId.get(el.containerId);
      if (container) recenterBoundText(container, elements);
    }
    applied.add("SMALL_FONT");
  }

  // 2. Grow small cards.
  for (const issue of issues.filter((i) => i.code === "SMALL_CARD")) {
    const el = byId.get(issue.elementIds[0]);
    if (!el) continue;
    el.width = Math.max(num(el.width), 120);
    el.height = Math.max(num(el.height), 56);
    recenterBoundText(el, elements);
    applied.add("SMALL_CARD");
  }

  // 3. Grow containers whose bound text overflows.
  for (const issue of issues.filter((i) => i.code === "TEXT_OVERFLOW")) {
    const text = byId.get(issue.elementIds[0]);
    const container = byId.get(issue.elementIds[1]);
    if (!text || !container) continue;
    const metrics = measureText(
      String(text.text ?? ""),
      num(text.fontSize, 16),
      num(text.fontFamily, 2),
    );
    const pad = opts.containerPadding + 8;
    container.width = Math.max(num(container.width), metrics.width + pad * 2);
    container.height = Math.max(num(container.height), metrics.height + pad * 2);
    recenterBoundText(container, elements);
    applied.add("TEXT_OVERFLOW");
  }

  // 4. Title untitled frames.
  let frameIndex = 0;
  for (const issue of issues.filter((i) => i.code === "FRAME_NO_TITLE")) {
    const el = byId.get(issue.elementIds[0]);
    if (!el || !isFrame(el)) continue;
    frameIndex += 1;
    el.name = `Frame ${frameIndex}`;
    applied.add("FRAME_NO_TITLE");
  }

  // 5. Snap off-grid shapes/frames (and their bound text) to the grid.
  for (const issue of issues.filter((i) => i.code === "OFF_GRID")) {
    const el = byId.get(issue.elementIds[0]);
    if (!el) continue;
    el.x = snapToGrid(num(el.x), opts.gridSize);
    el.y = snapToGrid(num(el.y), opts.gridSize);
    if (isShape(el)) recenterBoundText(el, elements);
    applied.add("OFF_GRID");
  }

  // 6. Items referencing a frame they sit outside: grow the frame to contain
  //    them (preferred — keeps the grouping) and re-snap the frame box.
  for (const issue of issues.filter((i) => i.code === "ITEM_OUTSIDE_FRAME")) {
    const el = byId.get(issue.elementIds[0]);
    const frame = byId.get(issue.elementIds[1]);
    if (!el || !frame || !isFrame(frame)) continue;
    const pad = 24;
    const fb = elementBBox(frame);
    const eb = elementBBox(el);
    const minX = Math.min(fb.minX, eb.minX - pad);
    const minY = Math.min(fb.minY, eb.minY - pad);
    const maxX = Math.max(fb.maxX, eb.maxX + pad);
    const maxY = Math.max(fb.maxY, eb.maxY + pad);
    frame.x = snapToGrid(minX, opts.gridSize);
    frame.y = snapToGrid(minY, opts.gridSize);
    frame.width = snapToGrid(maxX - minX, opts.gridSize);
    frame.height = snapToGrid(maxY - minY, opts.gridSize);
    applied.add("ITEM_OUTSIDE_FRAME");
  }

  // 7. Bind dangling arrows to the nearest shape at each free endpoint.
  const shapes = elements.filter((el) => isShape(el));
  for (const issue of issues.filter((i) => i.code === "ARROW_UNBOUND")) {
    const arrow = byId.get(issue.elementIds[0]);
    if (!arrow || arrow.type !== "arrow" || !Array.isArray(arrow.points)) continue;
    const ax = num(arrow.x);
    const ay = num(arrow.y);
    const first = arrow.points[0];
    const last = arrow.points[arrow.points.length - 1];
    const startPt: [number, number] = [ax + num(first?.[0]), ay + num(first?.[1])];
    const endPt: [number, number] = [ax + num(last?.[0]), ay + num(last?.[1])];

    const nearest = (
      point: [number, number],
      excludeId?: string,
    ): ExcalidrawElement | null => {
      let best: ExcalidrawElement | null = null;
      let bestDist = 80; // bind threshold
      for (const shape of shapes) {
        if (excludeId && shape.id === excludeId) continue;
        const [cx, cy] = bboxCenter(elementBBox(shape));
        const dist = Math.hypot(point[0] - cx, point[1] - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = shape;
        }
      }
      return best;
    };

    const addBound = (target: ExcalidrawElement) => {
      const existing = target.boundElements ?? [];
      if (!existing.some((b) => b.id === arrow.id)) {
        target.boundElements = [...existing, { id: arrow.id, type: "arrow" }];
      }
    };

    // Resolve start first; exclude it when resolving the end so an arrow whose
    // endpoints both fall over one shape never self-binds (degenerate loop).
    let startTargetId: string | undefined = arrow.startBinding?.elementId;
    if (!arrow.startBinding) {
      const target = nearest(startPt);
      if (target) {
        arrow.startBinding = { elementId: target.id, focus: 0, gap: 4 };
        addBound(target);
        startTargetId = target.id;
        applied.add("ARROW_UNBOUND");
      }
    }
    if (!arrow.endBinding) {
      const target = nearest(endPt, startTargetId);
      if (target) {
        arrow.endBinding = { elementId: target.id, focus: 0, gap: 4 };
        addBound(target);
        applied.add("ARROW_UNBOUND");
      }
    }
  }

  // 8. Nudge overlapping or duplicated/stacked shapes apart (loop converges).
  for (const issue of issues.filter(
    (i) => i.code === "OVERLAP" || i.code === "DUPLICATE_SHAPES",
  )) {
    const a = byId.get(issue.elementIds[0]);
    const b = byId.get(issue.elementIds[1]);
    if (!a || !b) continue;
    if (overlapRatio(elementBBox(a), elementBBox(b)) <= opts.overlapThreshold) {
      continue;
    }
    const boxA = elementBBox(a);
    const boxB = elementBBox(b);
    const shift = boxA.maxX - boxB.minX + 40;
    b.x = num(b.x) + shift;
    recenterBoundText(b, elements);
    applied.add("OVERLAP");
  }

  // Helpers for connector/label repairs (need opts + elements in scope).
  const crossesAny = (text: ExcalidrawElement, arrows: ExcalidrawElement[]) =>
    arrows.some((a) => linearCrossesRect(a, elementBBox(text)) > 0);

  const moveTextOffArrows = (
    text: ExcalidrawElement,
    arrows: ExcalidrawElement[],
  ): boolean => {
    if (!crossesAny(text, arrows)) return true;
    const step = 14;
    const dirs: Array<[number, number]> = [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ];
    const ox = num(text.x);
    const oy = num(text.y);
    for (const [dx, dy] of dirs) {
      for (let k = 1; k <= 12; k += 1) {
        text.x = ox + dx * step * k;
        text.y = oy + dy * step * k;
        if (!crossesAny(text, arrows)) {
          text.x = snapToGrid(num(text.x), opts.gridSize);
          text.y = snapToGrid(num(text.y), opts.gridSize);
          return true;
        }
      }
      text.x = ox;
      text.y = oy;
    }
    return false;
  };

  const detourArrowAround = (
    arrow: ExcalidrawElement,
    box: BBox,
    gap: number,
  ): boolean => {
    const segs = linearSegments(arrow);
    if (segs.length === 0) return false;
    const start = segs[0][0];
    const end = segs[segs.length - 1][1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const mid: [number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ];
    const reach = Math.max(bboxWidth(box), bboxHeight(box)) / 2 + gap;
    const orig = { x: arrow.x, y: arrow.y, points: arrow.points };
    for (const sign of [1, -1]) {
      const way: [number, number] = [
        mid[0] + px * reach * sign,
        mid[1] + py * reach * sign,
      ];
      const minX = Math.min(start[0], way[0], end[0]);
      const minY = Math.min(start[1], way[1], end[1]);
      arrow.x = minX;
      arrow.y = minY;
      arrow.points = [
        [start[0] - minX, start[1] - minY],
        [way[0] - minX, way[1] - minY],
        [end[0] - minX, end[1] - minY],
      ];
      arrow.width = Math.max(start[0], way[0], end[0]) - minX;
      arrow.height = Math.max(start[1], way[1], end[1]) - minY;
      if (linearCrossesRect(arrow, box) === 0) return true;
    }
    arrow.x = orig.x;
    arrow.y = orig.y;
    arrow.points = orig.points;
    return false;
  };

  // 9. Arrows crossing readable text: move free labels off the path, or detour
  //    the arrow with an elbow around a crossed card label.
  const allArrows = elements.filter((el) => el.type === "arrow");
  for (const issue of issues.filter((i) => i.code === "ARROW_TEXT_INTERSECTION")) {
    const arrow = byId.get(issue.elementIds[0]);
    const text = byId.get(issue.elementIds[1]);
    if (!arrow || !text) continue;
    if (!text.containerId && isText(text)) {
      if (moveTextOffArrows(text, allArrows)) {
        applied.add("ARROW_TEXT_INTERSECTION");
      }
    } else if (detourArrowAround(arrow, elementBBox(text), 28)) {
      applied.add("ARROW_TEXT_INTERSECTION");
    }
  }

  // 10. Content over a frame title band: lower it below the band.
  for (const issue of issues.filter((i) => i.code === "FRAME_TITLE_OVERLAP")) {
    const el = byId.get(issue.elementIds[0]);
    const frame = byId.get(issue.elementIds[1]);
    if (!el || !frame || !isFrame(frame)) continue;
    const band = frameTitleBand(frame, opts.frameTitleBand);
    const shift = band.maxY - elementBBox(el).minY + 8;
    if (shift > 0) {
      el.y = snapToGrid(num(el.y) + shift, opts.gridSize);
      if (isShape(el)) recenterBoundText(el, elements);
      applied.add("FRAME_TITLE_OVERLAP");
    }
  }

  // 11. Free labels hugging a frame border: nudge inward.
  for (const issue of issues.filter((i) => i.code === "TEXT_NEAR_EDGE")) {
    const el = byId.get(issue.elementIds[0]);
    const frame = byId.get(issue.elementIds[1]);
    if (!el || !frame) continue;
    const fb = elementBBox(frame);
    const eb = elementBBox(el);
    const m = opts.edgeMargin + 6;
    if (eb.minX - fb.minX < m) el.x = snapToGrid(fb.minX + m, opts.gridSize);
    else if (fb.maxX - eb.maxX < m) {
      el.x = snapToGrid(fb.maxX - bboxWidth(eb) - m, opts.gridSize);
    }
    if (fb.maxY - eb.maxY < m) {
      el.y = snapToGrid(fb.maxY - bboxHeight(eb) - m, opts.gridSize);
    }
    applied.add("TEXT_NEAR_EDGE");
  }

  return { scene: next, applied: Array.from(applied) };
};
