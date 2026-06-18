/**
 * export_drawing — `.excalidraw` (JSON) and a lightweight server-side SVG
 * renderer. PNG has no headless raster in this stack, so it returns a
 * structured fallback (use SVG or the editable URL) instead of breaking.
 *
 * Security: element fields (colors, coordinates, text) are attacker-controlled
 * for inline scene/element inputs, so EVERY interpolated value is escaped/
 * validated — colors against an allowlist, coordinates coerced to finite
 * numbers, and text/attributes XML-escaped — to prevent SVG/markup injection.
 */
import type { ExcalidrawElement, ExcalidrawScene } from "../types";
import { invalid } from "../errors";
import {
  elementBBox,
  isLinear,
  linearEndpoints,
  liveElements,
  unionBBox,
} from "../geometry/geometry";
import { redactScene } from "../security/redaction";

export type ExportFormat = "excalidraw" | "svg" | "png";

export interface ExportResult {
  format: ExportFormat;
  mimeType: string;
  content: string | null;
  encoding: "utf8" | "base64";
  sizeBytes: number;
  unsupported?: boolean;
  fallback?: { reason: string; suggestion: string; alternatives: ExportFormat[] };
}

const xmlEscape = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Coerce to a finite number (rejects strings/NaN/Infinity that could inject). */
const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Allowlist: #hex, rgb()/rgba(), or a bare CSS color name. Anything else (e.g.
// a value containing quotes/brackets/markup) falls back — no attribute breakout.
const COLOR_RE =
  /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]{1,32})$/;

const safeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "transparent") return fallback;
  return COLOR_RE.test(trimmed) ? trimmed : fallback;
};

const FONT_STACK: Record<number, string> = {
  1: "Virgil, 'Segoe Print', sans-serif",
  2: "Helvetica, Arial, sans-serif",
  3: "Cascadia, Consolas, monospace",
};

const renderElement = (el: ExcalidrawElement): string => {
  const stroke = safeColor(el.strokeColor, "#1e1e1e");
  const fill = safeColor(el.backgroundColor, "none");
  const sw = num(el.strokeWidth, 2);
  const x = num(el.x);
  const y = num(el.y);
  const w = Math.max(0, num(el.width));
  const h = Math.max(0, num(el.height));
  const dash =
    el.strokeStyle === "dashed"
      ? ' stroke-dasharray="8 6"'
      : el.strokeStyle === "dotted"
        ? ' stroke-dasharray="2 6"'
        : "";

  if (el.type === "rectangle" || el.type === "frame") {
    const rx = el.roundness ? 12 : 0;
    const frameStroke = el.type === "frame" ? "#adb5bd" : stroke;
    const frameDash = el.type === "frame" ? ' stroke-dasharray="6 6"' : dash;
    let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${frameStroke}" stroke-width="${sw}"${frameDash}/>`;
    if (el.type === "frame" && typeof el.name === "string" && el.name) {
      out += `<text x="${x + 6}" y="${y - 6}" font-size="14" font-family="${FONT_STACK[2]}" fill="#868e96">${xmlEscape(el.name)}</text>`;
    }
    return out;
  }
  if (el.type === "ellipse") {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
  }
  if (el.type === "diamond") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
  }
  if (el.type === "text") {
    const fontSize = num(el.fontSize, 20);
    const family =
      FONT_STACK[typeof el.fontFamily === "number" ? el.fontFamily : 2] ??
      FONT_STACK[2];
    const lines = String(el.text ?? "").split("\n");
    const anchor =
      el.textAlign === "center"
        ? "middle"
        : el.textAlign === "right"
          ? "end"
          : "start";
    const baseX =
      el.textAlign === "center" ? x + w / 2 : el.textAlign === "right" ? x + w : x;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${baseX}" y="${y + fontSize * 0.9 + i * fontSize * 1.25}">${xmlEscape(line)}</tspan>`,
      )
      .join("");
    return `<text font-size="${fontSize}" font-family="${family}" fill="${stroke}" text-anchor="${anchor}">${tspans}</text>`;
  }
  if (isLinear(el)) {
    const ends = linearEndpoints(el);
    const box = elementBBox(el);
    const pts = Array.isArray(el.points)
      ? el.points.map((p) => `${x + num(p?.[0])},${y + num(p?.[1])}`).join(" ")
      : `${box.minX},${box.minY} ${box.maxX},${box.maxY}`;
    let out = `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash}/>`;
    if (el.type === "arrow" && ends) {
      const [ex, ey] = ends.end;
      const [sx, sy] = ends.start;
      const angle = Math.atan2(ey - sy, ex - sx);
      const len = 12;
      const a1 = angle + Math.PI - 0.4;
      const a2 = angle + Math.PI + 0.4;
      const head = `${ex},${ey} ${ex + len * Math.cos(a1)},${ey + len * Math.sin(a1)} ${ex + len * Math.cos(a2)},${ey + len * Math.sin(a2)}`;
      out += `<polygon points="${head}" fill="${stroke}" stroke="${stroke}"/>`;
    }
    return out;
  }
  return "";
};

export const sceneToSvg = (scene: ExcalidrawScene): string => {
  const elements = liveElements(scene.elements);
  const box = unionBBox(elements) ?? { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const pad = 32;
  const minX = num(box.minX) - pad;
  const minY = num(box.minY) - pad;
  const width = Math.max(1, num(box.maxX) - num(box.minX) + pad * 2);
  const height = Math.max(1, num(box.maxY) - num(box.minY) + pad * 2);
  const bg = safeColor(
    (scene.appState as { viewBackgroundColor?: string })?.viewBackgroundColor,
    "#ffffff",
  );
  const body = elements.map(renderElement).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bg}"/>
${body}
</svg>`;
};

export const exportScene = (
  rawScene: ExcalidrawScene,
  format: ExportFormat,
  maxBytes: number,
): ExportResult => {
  // Redact secrets before they can leak into an exported file.
  const scene = redactScene(rawScene);
  if (format === "excalidraw") {
    const content = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "excalidash-mcp",
      elements: liveElements(scene.elements),
      appState: scene.appState ?? {},
      files: scene.files ?? {},
    });
    const sizeBytes = Buffer.byteLength(content, "utf8");
    if (sizeBytes > maxBytes) {
      throw invalid(`Export exceeds the size limit (${sizeBytes} > ${maxBytes} bytes).`);
    }
    return {
      format,
      mimeType: "application/json",
      content,
      encoding: "utf8",
      sizeBytes,
    };
  }

  if (format === "svg") {
    const content = sceneToSvg(scene);
    const sizeBytes = Buffer.byteLength(content, "utf8");
    if (sizeBytes > maxBytes) {
      throw invalid(`Export exceeds the size limit (${sizeBytes} > ${maxBytes} bytes).`);
    }
    return {
      format,
      mimeType: "image/svg+xml",
      content,
      encoding: "utf8",
      sizeBytes,
    };
  }

  // PNG: no headless rasterizer in this stack.
  return {
    format: "png",
    mimeType: "image/png",
    content: null,
    encoding: "base64",
    sizeBytes: 0,
    unsupported: true,
    fallback: {
      reason:
        "Server-side PNG rasterization is not available in this deployment.",
      suggestion:
        "Export SVG (vector) here, or open the editable URL and use the Excalidraw client to export PNG.",
      alternatives: ["svg", "excalidraw"],
    },
  };
};
