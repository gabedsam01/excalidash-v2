/**
 * Excalidraw element factory + deterministic scene builder.
 *
 * Server-side diagram generation produces valid-enough Excalidraw elements that
 * the editor renders. Generation is deterministic given a seed so tests are
 * stable (no Date.now()/Math.random() leaking into output).
 */
import type { ExcalidrawElement, ExcalidrawScene } from "../types";

/** Excalidraw font families. */
export const FONT_FAMILY = { handDrawn: 1, normal: 2, code: 3 } as const;

/** Deterministic PRNG (mulberry32). */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Approximate text metrics. Excalidraw uses canvas measurement; we approximate
 * (avg glyph ≈ 0.52·fontSize for normal, line height ≈ 1.25·fontSize) which is
 * accurate enough for layout sizing and overflow validation.
 */
export const measureText = (
  text: string,
  fontSize: number,
  fontFamily: number = FONT_FAMILY.normal,
): { width: number; height: number; lines: string[] } => {
  const glyph = fontFamily === FONT_FAMILY.code ? 0.6 : 0.52;
  const lines = String(text ?? "").split("\n");
  const width = Math.max(
    0,
    ...lines.map((line) => line.length * fontSize * glyph),
  );
  const lineHeight = fontSize * 1.25;
  return { width, height: Math.max(lineHeight, lines.length * lineHeight), lines };
};

export interface RectOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  rounded?: boolean;
  groupIds?: string[];
  frameId?: string | null;
  type?: "rectangle" | "ellipse" | "diamond";
}

export interface TextOptions {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: number;
  strokeColor?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  groupIds?: string[];
  frameId?: string | null;
  containerId?: string | null;
}

export interface ArrowOptions {
  start: [number, number];
  end: [number, number];
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  type?: "arrow" | "line";
  groupIds?: string[];
  frameId?: string | null;
}

/** Builds a deterministic Excalidraw scene. */
export class SceneBuilder {
  private readonly rng: () => number;
  private idCounter = 0;
  private clock = 1_700_000_000_000;
  readonly elements: ExcalidrawElement[] = [];
  appState: Record<string, unknown> = {
    viewBackgroundColor: "#ffffff",
    gridSize: null,
  };

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
  }

  private nextId(prefix = "el"): string {
    this.idCounter += 1;
    return `${prefix}_${this.idCounter.toString(36)}_${Math.floor(
      this.rng() * 1e9,
    ).toString(36)}`;
  }

  private nextSeed(): number {
    return Math.floor(this.rng() * 2_147_483_647);
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  private base(
    type: string,
    over: Partial<ExcalidrawElement>,
  ): ExcalidrawElement {
    return {
      id: over.id ?? this.nextId(type),
      type,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: this.nextSeed(),
      version: 1,
      versionNonce: this.nextSeed(),
      isDeleted: false,
      boundElements: null,
      updated: this.tick(),
      link: null,
      locked: false,
      ...over,
    };
  }

  /** Add a rectangle/ellipse/diamond shape. */
  shape(options: RectOptions): ExcalidrawElement {
    const element = this.base(options.type ?? "rectangle", {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      strokeColor: options.strokeColor ?? "#1e1e1e",
      backgroundColor: options.backgroundColor ?? "transparent",
      fillStyle: options.fillStyle ?? "solid",
      strokeWidth: options.strokeWidth ?? 2,
      strokeStyle: options.strokeStyle ?? "solid",
      roughness: options.roughness ?? 1,
      groupIds: options.groupIds ?? [],
      frameId: options.frameId ?? null,
      roundness: options.rounded === false ? null : { type: 3 },
    });
    this.elements.push(element);
    return element;
  }

  /** Add a free-standing text element. */
  text(options: TextOptions): ExcalidrawElement {
    const fontSize = options.fontSize ?? 20;
    const fontFamily = options.fontFamily ?? FONT_FAMILY.normal;
    const metrics = measureText(options.text, fontSize, fontFamily);
    const element = this.base("text", {
      x: options.x,
      y: options.y,
      width: metrics.width,
      height: metrics.height,
      strokeColor: options.strokeColor ?? "#1e1e1e",
      groupIds: options.groupIds ?? [],
      frameId: options.frameId ?? null,
      text: options.text,
      originalText: options.text,
      fontSize,
      fontFamily,
      textAlign: options.textAlign ?? "left",
      verticalAlign: options.verticalAlign ?? "top",
      containerId: options.containerId ?? null,
      lineHeight: 1.25,
      baseline: Math.round(fontSize * 0.9),
    });
    this.elements.push(element);
    return element;
  }

  /**
   * Create a shape with centered, bound text — the canonical "labeled card".
   * The text is sized to fit and bound to the container (boundElements).
   */
  labeledShape(
    options: RectOptions & {
      label: string;
      fontSize?: number;
      fontFamily?: number;
      labelColor?: string;
    },
  ): { container: ExcalidrawElement; label: ExcalidrawElement } {
    const container = this.shape(options);
    const fontSize = options.fontSize ?? 16;
    const fontFamily = options.fontFamily ?? FONT_FAMILY.normal;
    const metrics = measureText(options.label, fontSize, fontFamily);
    const label = this.base("text", {
      x: options.x + (options.width - metrics.width) / 2,
      y: options.y + (options.height - metrics.height) / 2,
      width: metrics.width,
      height: metrics.height,
      strokeColor: options.labelColor ?? "#1e1e1e",
      groupIds: options.groupIds ?? [],
      frameId: options.frameId ?? null,
      text: options.label,
      originalText: options.label,
      fontSize,
      fontFamily,
      textAlign: "center",
      verticalAlign: "middle",
      containerId: container.id,
      lineHeight: 1.25,
      baseline: Math.round(fontSize * 0.9),
    });
    this.elements.push(label);
    container.boundElements = [
      ...(container.boundElements ?? []),
      { id: label.id, type: "text" },
    ];
    return { container, label };
  }

  /** Add an arrow/line. Optionally bind endpoints to elements. */
  connector(
    options: ArrowOptions & {
      startElement?: ExcalidrawElement;
      endElement?: ExcalidrawElement;
    },
  ): ExcalidrawElement {
    const [sx, sy] = options.start;
    const [ex, ey] = options.end;
    const minX = Math.min(sx, ex);
    const minY = Math.min(sy, ey);
    const type = options.type ?? "arrow";
    const element = this.base(type, {
      x: sx,
      y: sy,
      width: Math.abs(ex - sx),
      height: Math.abs(ey - sy),
      strokeColor: options.strokeColor ?? "#1e1e1e",
      strokeWidth: options.strokeWidth ?? 2,
      strokeStyle: options.strokeStyle ?? "solid",
      roughness: options.roughness ?? 1,
      groupIds: options.groupIds ?? [],
      frameId: options.frameId ?? null,
      roundness: { type: 2 },
      points: [
        [0, 0],
        [ex - sx, ey - sy],
      ],
      lastCommittedPoint: null,
      startArrowhead: options.startArrowhead ?? null,
      endArrowhead:
        options.endArrowhead ?? (type === "arrow" ? "arrow" : null),
      startBinding: options.startElement
        ? { elementId: options.startElement.id, focus: 0, gap: 4 }
        : null,
      endBinding: options.endElement
        ? { elementId: options.endElement.id, focus: 0, gap: 4 }
        : null,
    });
    // keep minX/minY reference consistent with x/y
    element.x = sx === minX ? sx : minX;
    element.y = sy === minY ? sy : minY;
    element.points = [
      [sx - element.x, sy - element.y],
      [ex - element.x, ey - element.y],
    ];
    this.elements.push(element);
    if (options.startElement) {
      options.startElement.boundElements = [
        ...(options.startElement.boundElements ?? []),
        { id: element.id, type: "arrow" },
      ];
    }
    if (options.endElement) {
      options.endElement.boundElements = [
        ...(options.endElement.boundElements ?? []),
        { id: element.id, type: "arrow" },
      ];
    }
    return element;
  }

  /**
   * Add an orthogonally-routed arrow through explicit absolute waypoints (used
   * for connector gutters / side-lanes so long edges never cross cards or text).
   */
  routedConnector(
    options: {
      points: Array<[number, number]>;
      startElement?: ExcalidrawElement;
      endElement?: ExcalidrawElement;
      strokeColor?: string;
      strokeWidth?: number;
      strokeStyle?: string;
      roughness?: number;
      endArrowhead?: string | null;
    },
  ): ExcalidrawElement {
    const pts = options.points;
    const minX = Math.min(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1]));
    const maxX = Math.max(...pts.map((p) => p[0]));
    const maxY = Math.max(...pts.map((p) => p[1]));
    const element = this.base("arrow", {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      strokeColor: options.strokeColor ?? "#1e1e1e",
      strokeWidth: options.strokeWidth ?? 2,
      strokeStyle: options.strokeStyle ?? "solid",
      roughness: options.roughness ?? 1,
      roundness: { type: 2 },
      points: pts.map((p): [number, number] => [p[0] - minX, p[1] - minY]),
      lastCommittedPoint: null,
      startArrowhead: null,
      endArrowhead: options.endArrowhead ?? "arrow",
      startBinding: options.startElement
        ? { elementId: options.startElement.id, focus: 0, gap: 4 }
        : null,
      endBinding: options.endElement
        ? { elementId: options.endElement.id, focus: 0, gap: 4 }
        : null,
    });
    this.elements.push(element);
    if (options.startElement) {
      options.startElement.boundElements = [
        ...(options.startElement.boundElements ?? []),
        { id: element.id, type: "arrow" },
      ];
    }
    if (options.endElement) {
      options.endElement.boundElements = [
        ...(options.endElement.boundElements ?? []),
        { id: element.id, type: "arrow" },
      ];
    }
    return element;
  }

  /** Add a frame (group container with a title). */
  frame(options: {
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
  }): ExcalidrawElement {
    const element = this.base("frame", {
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      name: options.name,
      roundness: null,
      strokeColor: "#bbb",
      backgroundColor: "transparent",
    });
    this.elements.push(element);
    return element;
  }

  /** Assemble the final scene. */
  build(appState: Record<string, unknown> = {}): ExcalidrawScene {
    return {
      type: "excalidraw",
      version: 2,
      source: "excalidash-mcp",
      elements: this.elements,
      appState: { ...this.appState, ...appState },
      files: {},
    };
  }
}

/** Wrap loose elements into a valid scene without mutation. */
export const toScene = (
  elements: ExcalidrawElement[],
  appState: Record<string, unknown> = {},
): ExcalidrawScene => ({
  type: "excalidraw",
  version: 2,
  source: "excalidash-mcp",
  elements,
  appState: { viewBackgroundColor: "#ffffff", gridSize: null, ...appState },
  files: {},
});
