/**
 * lint_drawing detectors — geometry-backed validation of an Excalidraw scene.
 * Each detector returns LintIssue[]; the engine aggregates and de-duplicates.
 */
import type { ExcalidrawElement, ExcalidrawScene, LintIssue } from "../types";
import { measureText } from "../excalidraw/elements";
import {
  bboxArea,
  bboxCenter,
  contains,
  containmentRatio,
  elementBBox,
  frameTitleBand,
  intersectionArea,
  isFrame,
  isLinear,
  isArrow,
  isShape,
  isText,
  isOnGrid,
  linearCrossesRect,
  linearSegments,
  liveElements,
  maxRegionDensity,
  overlapRatio,
  rectsIntersect,
  segmentsIntersect,
  unionBBox,
} from "../geometry/geometry";
import { isLibraryElement, isLegendElement, metaOf } from "../libraries/metadata";

/** Decorative elements (icons, legend swatches, badges, symbols) are exempt
 *  from card-size / proportion checks — they're intentionally small/varied. */
const isDecorative = (el: ExcalidrawElement): boolean =>
  Boolean(metaOf(el)?.role) || isLibraryElement(el);

export interface LintOptions {
  gridSize: number;
  minFontSize: number;
  containerPadding: number;
  overlapThreshold: number;
  densityCellSize: number;
  maxDensity: number;
  minCardWidth: number;
  minCardHeight: number;
  /** Reserved title band height at the top of a titled frame. */
  frameTitleBand: number;
  /** Min distance content/text should keep from a frame's inner border. */
  edgeMargin: number;
  /** Approx stroke thickness used to turn an arrow/text overlap into an area. */
  arrowThickness: number;
  /** Min clipped arrow length (px) inside a text box to count as a crossing. */
  arrowTextMinLength: number;
  /** When true, flag scenes that use no library/icon items (NO_LIBRARY_USAGE). */
  requireLibrary: boolean;
  /** error => required mode, warning => curated mode. */
  libraryRequiredSeverity: "error" | "warning";
  /** When true, a shapes-are-only-rectangles rich diagram is flagged. */
  expectRichArchitecture: boolean;
  /** When true, a flow/architecture with no legend is flagged. */
  requireLegend: boolean;
}

export const DEFAULT_LINT_OPTIONS: LintOptions = {
  gridSize: 20,
  minFontSize: 14,
  containerPadding: 4,
  overlapThreshold: 0.15,
  densityCellSize: 220,
  maxDensity: 10,
  minCardWidth: 48,
  minCardHeight: 28,
  frameTitleBand: 40,
  edgeMargin: 10,
  arrowThickness: 8,
  arrowTextMinLength: 6,
  requireLibrary: false,
  libraryRequiredSeverity: "warning",
  expectRichArchitecture: false,
  requireLegend: false,
};

const num = (v: unknown, f = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : f;

export const resolveLintOptions = (
  scene: ExcalidrawScene,
  overrides: Partial<LintOptions> = {},
): LintOptions => {
  const grid = num((scene.appState as { gridSize?: unknown })?.gridSize, 0);
  return {
    ...DEFAULT_LINT_OPTIONS,
    ...(grid > 0 ? { gridSize: grid } : {}),
    ...overrides,
  };
};

type Detector = (
  elements: ExcalidrawElement[],
  opts: LintOptions,
) => LintIssue[];

const detectEmpty: Detector = (elements) =>
  elements.length === 0
    ? [
        {
          code: "EMPTY_SCENE",
          severity: "error",
          message: "The scene has no elements.",
          elementIds: [],
          dimension: "structure",
          repairable: false,
        },
      ]
    : [];

const detectBoundTextOverflow: Detector = (elements, opts) => {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isText(el) || !el.containerId) continue;
    const container = byId.get(el.containerId);
    if (!container) continue;
    const textBox = elementBBox(el);
    const cBox = elementBBox(container);
    if (!contains(cBox, textBox, opts.containerPadding)) {
      const overflowX = Math.max(
        0,
        textBox.maxX - cBox.maxX,
        cBox.minX - textBox.minX,
      );
      const overflowY = Math.max(
        0,
        textBox.maxY - cBox.maxY,
        cBox.minY - textBox.minY,
      );
      issues.push({
        code: "TEXT_OVERFLOW",
        severity: "error",
        message: `Text "${String(el.text ?? "").slice(0, 24)}" overflows its container.`,
        elementIds: [el.id, container.id],
        dimension: "containment",
        repairable: true,
        metrics: { overflowX: Math.round(overflowX), overflowY: Math.round(overflowY) },
      });
    }
  }
  return issues;
};

const detectSmallCards: Detector = (elements, opts) => {
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isShape(el) || el.type === "image" || isDecorative(el)) continue;
    if (num(el.width) < opts.minCardWidth || num(el.height) < opts.minCardHeight) {
      issues.push({
        code: "SMALL_CARD",
        severity: "warning",
        message: `Shape is too small (${Math.round(num(el.width))}×${Math.round(
          num(el.height),
        )}).`,
        elementIds: [el.id],
        dimension: "containment",
        repairable: true,
        metrics: { width: Math.round(num(el.width)), height: Math.round(num(el.height)) },
      });
    }
  }
  return issues;
};

const detectOverlaps: Detector = (elements, opts) => {
  const shapes = elements.filter(
    (el) => isShape(el) && el.type !== "image" && !isDecorative(el),
  );
  const issues: LintIssue[] = [];
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const a = shapes[i];
      const b = shapes[j];
      const boxA = elementBBox(a);
      const boxB = elementBBox(b);
      const ratio = overlapRatio(boxA, boxB);
      if (ratio > opts.overlapThreshold && ratio < 0.95) {
        issues.push({
          code: "OVERLAP",
          severity: "warning",
          message: `Shapes overlap (${Math.round(ratio * 100)}%).`,
          elementIds: [a.id, b.id],
          dimension: "layout",
          repairable: true,
          metrics: { overlapRatio: Math.round(ratio * 100) },
        });
      } else if (ratio >= 0.95) {
        // ratio >= 0.95 is either intentional containment (small inside large)
        // OR an unintended exact duplicate (two near-equal shapes stacked).
        // Distinguish by relative size: near-equal areas => duplicate.
        const areaA = bboxArea(boxA);
        const areaB = bboxArea(boxB);
        const larger = Math.max(areaA, areaB);
        const sizeRatio = larger > 0 ? Math.min(areaA, areaB) / larger : 1;
        if (sizeRatio > 0.8) {
          issues.push({
            code: "DUPLICATE_SHAPES",
            severity: "error",
            message: `Shapes are stacked/duplicated (${Math.round(ratio * 100)}% overlap) — one hides the other.`,
            elementIds: [a.id, b.id],
            dimension: "layout",
            repairable: true,
            metrics: { overlapRatio: Math.round(ratio * 100), sizeRatio: Math.round(sizeRatio * 100) },
          });
        }
      }
    }
  }
  return issues;
};

const detectUnboundArrows: Detector = (elements) => {
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (el.type !== "arrow") continue;
    if (!el.startBinding || !el.endBinding) {
      issues.push({
        code: "ARROW_UNBOUND",
        severity: "warning",
        message: "Arrow is not bound to a start and/or end element.",
        elementIds: [el.id],
        dimension: "connections",
        repairable: true,
      });
    }
  }
  return issues;
};

const detectOutsideFrame: Detector = (elements) => {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!el.frameId) continue;
    const frame = byId.get(el.frameId);
    if (!frame || !isFrame(frame)) continue;
    if (!contains(elementBBox(frame), elementBBox(el), 0)) {
      issues.push({
        code: "ITEM_OUTSIDE_FRAME",
        severity: "warning",
        message: "Element references a frame but sits outside its bounds.",
        elementIds: [el.id, frame.id],
        dimension: "structure",
        repairable: true,
      });
    }
  }
  return issues;
};

const detectOffGrid: Detector = (elements, opts) => {
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isShape(el) && !isFrame(el)) continue;
    if (isDecorative(el)) continue;
    if (!isOnGrid(num(el.x), opts.gridSize) || !isOnGrid(num(el.y), opts.gridSize)) {
      issues.push({
        code: "OFF_GRID",
        severity: "info",
        message: `Element is off the ${opts.gridSize}px grid.`,
        elementIds: [el.id],
        dimension: "spacing",
        repairable: true,
      });
    }
  }
  return issues;
};

const detectSmallFont: Detector = (elements, opts) => {
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isText(el)) continue;
    if (num(el.fontSize, 20) < opts.minFontSize) {
      issues.push({
        code: "SMALL_FONT",
        severity: "warning",
        message: `Font size ${num(el.fontSize)}px is below the readable minimum (${opts.minFontSize}px).`,
        elementIds: [el.id],
        dimension: "readability",
        repairable: true,
        metrics: { fontSize: num(el.fontSize), minFontSize: opts.minFontSize },
      });
    }
  }
  return issues;
};

const detectFrameNoTitle: Detector = (elements) => {
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isFrame(el)) continue;
    const name = typeof el.name === "string" ? el.name.trim() : "";
    if (name.length === 0) {
      issues.push({
        code: "FRAME_NO_TITLE",
        severity: "warning",
        message: "Frame has no title.",
        elementIds: [el.id],
        dimension: "structure",
        repairable: true,
      });
    }
  }
  return issues;
};

const detectDensity: Detector = (elements, opts) => {
  const visible = elements.filter((el) => !isLinear(el));
  if (visible.length < 6) return [];
  const { max } = maxRegionDensity(visible, opts.densityCellSize);
  return max > opts.maxDensity
    ? [
        {
          code: "HIGH_DENSITY",
          severity: "warning",
          message: `Too many elements packed into one region (${max}).`,
          elementIds: [],
          dimension: "spacing",
          repairable: false,
        },
      ]
    : [];
};

const detectDisproportion: Detector = (elements) => {
  const shapes = elements.filter(
    (el) => isShape(el) && el.type !== "image" && !isDecorative(el),
  );
  if (shapes.length < 3) return [];
  const areas = shapes.map((el) => bboxArea(elementBBox(el))).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] || 1;
  const issues: LintIssue[] = [];
  for (const el of shapes) {
    const area = bboxArea(elementBBox(el));
    if (median > 0 && (area > median * 8 || area < median / 8)) {
      issues.push({
        code: "DISPROPORTION",
        severity: "info",
        message: "Shape is strongly disproportionate to its siblings.",
        elementIds: [el.id],
        dimension: "consistency",
        repairable: false,
      });
    }
  }
  return issues;
};

const detectOutsideViewport: Detector = (elements) => {
  if (elements.length < 2) return [];
  const scene = unionBBox(elements);
  if (!scene) return [];
  const [cx, cy] = bboxCenter(scene);
  const diag = Math.hypot(scene.maxX - scene.minX, scene.maxY - scene.minY) || 1;
  const issues: LintIssue[] = [];
  for (const el of elements) {
    const [ex, ey] = bboxCenter(elementBBox(el));
    if (Math.hypot(ex - cx, ey - cy) > diag * 1.5) {
      issues.push({
        code: "OUTSIDE_VIEWPORT",
        severity: "info",
        message: "Element is far outside the main diagram region.",
        elementIds: [el.id],
        dimension: "layout",
        repairable: false,
      });
    }
  }
  return issues;
};

/**
 * Arrow passing over readable text — the canonical "setas por cima de texto"
 * defect. Uses segment/rectangle clipping (not bbox-vs-bbox) so it only fires
 * when the arrow's actual line crosses the text rectangle. Text bound to the
 * arrow's own endpoint cards is excluded (the arrow legitimately touches them).
 */
const detectArrowTextIntersection: Detector = (elements, opts) => {
  const texts = elements.filter(isText);
  const arrows = elements.filter(isArrow);
  if (texts.length === 0 || arrows.length === 0) return [];
  const issues: LintIssue[] = [];
  for (const arrow of arrows) {
    const endpointShapeIds = new Set(
      [arrow.startBinding?.elementId, arrow.endBinding?.elementId].filter(
        (x): x is string => Boolean(x),
      ),
    );
    for (const text of texts) {
      if (text.containerId && endpointShapeIds.has(text.containerId)) continue;
      const box = elementBBox(text);
      const len = linearCrossesRect(arrow, box, opts.arrowTextMinLength);
      if (len > 0) {
        const intersectionArea = Math.round(len * opts.arrowThickness);
        issues.push({
          code: "ARROW_TEXT_INTERSECTION",
          severity: "error",
          message: `Arrow crosses readable text "${String(text.text ?? "")
            .slice(0, 24)
            .trim()}" (≈${intersectionArea}px²).`,
          elementIds: [arrow.id, text.id],
          dimension: "connections",
          repairable: true,
          metrics: { intersectionArea, clipLength: Math.round(len) },
        });
      }
    }
  }
  return issues;
};

/** Content intruding into a titled frame's reserved title band. */
const detectFrameTitleOverlap: Detector = (elements, opts) => {
  const frames = elements.filter(isFrame);
  if (frames.length === 0) return [];
  const issues: LintIssue[] = [];
  for (const frame of frames) {
    const name = typeof frame.name === "string" ? frame.name.trim() : "";
    if (!name) continue;
    const frameBox = elementBBox(frame);
    const band = frameTitleBand(frame, opts.frameTitleBand);
    for (const el of elements) {
      if (el.id === frame.id || isFrame(el) || isLinear(el)) continue;
      if (isText(el) && el.containerId) continue; // handled via its container
      if (!isShape(el) && !isText(el)) continue;
      const box = elementBBox(el);
      const inFrame =
        el.frameId === frame.id || containmentRatio(frameBox, box) > 0.5;
      if (!inFrame) continue;
      if (rectsIntersect(box, band, 1)) {
        issues.push({
          code: "FRAME_TITLE_OVERLAP",
          severity: "error",
          message: `Content overlaps the title band of frame "${name}".`,
          elementIds: [el.id, frame.id],
          dimension: "structure",
          repairable: true,
          metrics: { intersectionArea: Math.round(intersectionArea(box, band)) },
        });
      }
    }
  }
  return issues;
};

/** Free labels hugging a frame's inner border (no breathing room). */
const detectTextNearEdge: Detector = (elements, opts) => {
  const frames = elements.filter(isFrame);
  if (frames.length === 0) return [];
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isText(el) || el.containerId) continue;
    const box = elementBBox(el);
    for (const frame of frames) {
      const fb = elementBBox(frame);
      const inFrame = el.frameId === frame.id || containmentRatio(fb, box) > 0.6;
      if (!inFrame) continue;
      if (
        box.minX - fb.minX < opts.edgeMargin ||
        fb.maxX - box.maxX < opts.edgeMargin ||
        fb.maxY - box.maxY < opts.edgeMargin
      ) {
        issues.push({
          code: "TEXT_NEAR_EDGE",
          severity: "warning",
          message: "Text is too close to its frame border.",
          elementIds: [el.id, frame.id],
          dimension: "spacing",
          repairable: true,
        });
      }
      break;
    }
  }
  return issues;
};

/** Arrows that needlessly cross each other (scene-level, bounded penalty). */
const detectCrossingArrows: Detector = (elements) => {
  const arrows = elements.filter(isArrow);
  if (arrows.length < 3) return [];
  const segs = arrows
    .map((a) => linearSegments(a))
    .map((s) => (s.length > 0 ? ([s[0][0], s[s.length - 1][1]] as const) : null))
    .filter((s): s is readonly [[number, number], [number, number]] =>
      Boolean(s),
    );
  let crossings = 0;
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      if (segmentsIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1])) {
        crossings += 1;
      }
    }
  }
  const threshold = Math.max(1, Math.floor(arrows.length / 3));
  return crossings > threshold
    ? [
        {
          code: "CROSSING_ARROWS",
          severity: "warning",
          message: `${crossings} arrow crossings — route connectors through gutters/lanes.`,
          elementIds: [],
          dimension: "connections",
          repairable: false,
        },
      ]
    : [];
};

/** Gated: a rich diagram that imports no library/icon items. */
const detectMissingLibrary: Detector = (elements, opts) => {
  if (!opts.requireLibrary) return [];
  if (elements.some(isLibraryElement)) return [];
  const cards = elements.filter((el) => isShape(el) && el.type !== "image");
  if (cards.length < 3) return [];
  return [
    {
      code: "NO_LIBRARY_USAGE",
      severity: opts.libraryRequiredSeverity,
      message:
        "Library usage is required but no library/icon items are present.",
      elementIds: [],
      dimension: "consistency",
      repairable: false,
    },
  ];
};

/** Gated: a rich architecture drawn with rectangles only (no icons/symbols). */
const detectRectangleOnly: Detector = (elements) => {
  // Only meaningful with the expectRichArchitecture flag (checked in lintScene).
  const shapes = elements.filter((el) => isShape(el));
  if (shapes.length < 6) return [];
  const onlyRect =
    shapes.every((el) => el.type === "rectangle") &&
    !elements.some(isLibraryElement);
  return onlyRect
    ? [
        {
          code: "RECTANGLE_ONLY",
          severity: "warning",
          message:
            "Rich architecture drawn with rectangles only — add icons/symbols or library items.",
          elementIds: [],
          dimension: "consistency",
          repairable: false,
        },
      ]
    : [];
};

/** Gated: a flow/architecture with no legend. */
const detectMissingLegend: Detector = (elements) => {
  if (elements.some(isLegendElement)) return [];
  const cards = elements.filter((el) => isShape(el) && el.type !== "image");
  if (cards.length < 4) return [];
  return [
    {
      code: "MISSING_LEGEND",
      severity: "warning",
      message: "Diagram has no legend explaining its symbols/zones.",
      elementIds: [],
      dimension: "structure",
      repairable: false,
    },
  ];
};

const DETECTORS: Detector[] = [
  detectEmpty,
  detectBoundTextOverflow,
  detectSmallCards,
  detectOverlaps,
  detectUnboundArrows,
  detectOutsideFrame,
  detectOffGrid,
  detectSmallFont,
  detectFrameNoTitle,
  detectDensity,
  detectDisproportion,
  detectOutsideViewport,
  detectArrowTextIntersection,
  detectFrameTitleOverlap,
  detectTextNearEdge,
  detectCrossingArrows,
  detectMissingLibrary,
];

/** Detectors that only run when their gating option is enabled. */
const GATED_DETECTORS: Array<{ flag: keyof LintOptions; detector: Detector }> = [
  { flag: "expectRichArchitecture", detector: detectRectangleOnly },
  { flag: "requireLegend", detector: detectMissingLegend },
];

/** Run all detectors over a scene. */
export const lintScene = (
  scene: ExcalidrawScene,
  overrides: Partial<LintOptions> = {},
): LintIssue[] => {
  const opts = resolveLintOptions(scene, overrides);
  const elements = liveElements(scene.elements);
  const issues = DETECTORS.flatMap((detector) => detector(elements, opts));
  for (const { flag, detector } of GATED_DETECTORS) {
    if (opts[flag]) issues.push(...detector(elements, opts));
  }
  return issues;
};

export { measureText };
