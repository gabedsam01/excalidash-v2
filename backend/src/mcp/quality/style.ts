/**
 * Aesthetic (non-geometry) lint detectors: colour discipline, WCAG contrast,
 * iconography, and typographic hierarchy. These are JSON-only and deterministic
 * (no rasterization) so they flow through the same severity-penalty machinery
 * as the geometry detectors. They are GATED behind explicit flags so default
 * lint behaviour is unchanged; the architecture create path opts in.
 */
import type { ExcalidrawElement, ExcalidrawScene, LintIssue } from "../types";
import { elementBBox, isShape, isText, overlapRatio } from "../geometry/geometry";
import { isLibraryElement, metaOf } from "../libraries/metadata";
import { resolveConcept } from "../../libraries/conceptIndex";

const num = (v: unknown, f = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : f;

const isDecorative = (el: ExcalidrawElement): boolean =>
  Boolean(metaOf(el)?.role) || isLibraryElement(el);

// ---------------------------------------------------------------- colour math

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse a hex colour (#rgb / #rrggbb / #rrggbbaa). Returns null otherwise. */
export const parseHex = (value: string): Rgb | null => {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(String(value).trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length < 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
};

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance (0..1). */
export const relativeLuminance = ({ r, g, b }: Rgb): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio (1..21) between two colours. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

/** Coarse hue family bucket (0..11) for a colour, or null for neutral/transparent. */
export const hueFamily = (value: string): number | null => {
  if (!value || value === "transparent") return null;
  const rgb = parseHex(value);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  // Near-neutral (white/black/grey) is not a hue family.
  if (d < 0.06) return null;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return Math.floor(h / 30) % 12; // 12 buckets of 30°
};

export const WCAG_AA = 4.5;
export const MAX_HUE_FAMILIES = 3;

// ------------------------------------------------------------------ detectors

const sceneBackground = (scene: ExcalidrawScene): Rgb => {
  const bg = (scene.appState as { viewBackgroundColor?: unknown })
    ?.viewBackgroundColor;
  return parseHex(typeof bg === "string" ? bg : "#ffffff") ?? { r: 255, g: 255, b: 255 };
};

/** Text/background contrast below WCAG AA (gated by enforceContrast). */
export const detectLowContrast = (
  scene: ExcalidrawScene,
  elements: ExcalidrawElement[],
): LintIssue[] => {
  const sceneBg = sceneBackground(scene);
  const byId = new Map(elements.map((el) => [el.id, el]));
  const issues: LintIssue[] = [];
  for (const el of elements) {
    if (!isText(el)) continue;
    const fg = parseHex(String(el.strokeColor ?? "#1e1e1e"));
    if (!fg) continue;
    let bg = sceneBg;
    const container = el.containerId ? byId.get(String(el.containerId)) : undefined;
    if (container) {
      const cbg = parseHex(String(container.backgroundColor ?? ""));
      if (cbg) bg = cbg;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < WCAG_AA) {
      issues.push({
        code: "LOW_CONTRAST",
        severity: "warning",
        message: `Text "${String(el.text ?? "").slice(0, 20)}" contrast ${ratio.toFixed(
          1,
        )}:1 is below WCAG AA (${WCAG_AA}:1).`,
        elementIds: [el.id],
        dimension: "readability",
        repairable: true,
        metrics: { contrast: Math.round(ratio * 10) / 10 },
      });
    }
  }
  return issues;
};

/** Too many hue families / mixed roughness / mixed fonts (gated by enforceStyleTokens). */
export const detectStyleDrift = (
  elements: ExcalidrawElement[],
): LintIssue[] => {
  const cards = elements.filter((el) => isShape(el) && !isDecorative(el));
  const issues: LintIssue[] = [];
  if (cards.length >= 3) {
    const families = new Set<number>();
    for (const el of cards) {
      const fam = hueFamily(String(el.backgroundColor ?? "transparent"));
      if (fam !== null) families.add(fam);
    }
    if (families.size > MAX_HUE_FAMILIES) {
      issues.push({
        code: "TOO_MANY_COLORS",
        severity: "warning",
        message: `Diagram uses ${families.size} hue families — keep it to ${MAX_HUE_FAMILIES} or fewer.`,
        elementIds: [],
        dimension: "consistency",
        repairable: false,
        metrics: { hueFamilies: families.size, max: MAX_HUE_FAMILIES },
      });
    }
    const roughness = new Set(cards.map((el) => num(el.roughness)));
    if (roughness.size > 1) {
      issues.push({
        code: "STYLE_DRIFT",
        severity: "warning",
        message: `Mixed roughness across cards (${[...roughness].join(", ")}) — lock one value.`,
        elementIds: [],
        dimension: "consistency",
        repairable: true,
        metrics: { roughnessVariants: roughness.size },
      });
    }
  }
  const texts = elements.filter((el) => isText(el) && !isDecorative(el));
  if (texts.length >= 3) {
    const fonts = new Set(texts.map((el) => num(el.fontFamily, 1)));
    if (fonts.size > 1) {
      issues.push({
        code: "STYLE_DRIFT",
        severity: "warning",
        message: `Mixed font families across labels (${fonts.size}) — use one family.`,
        elementIds: [],
        dimension: "consistency",
        repairable: true,
        metrics: { fontVariants: fonts.size },
      });
    }
  }
  return issues;
};

/** Recognized nodes drawn with no icon (gated by requireIcons). */
export const detectMissingIcon = (
  elements: ExcalidrawElement[],
): LintIssue[] => {
  const cards = elements.filter((el) => isShape(el) && !isDecorative(el));
  if (cards.length < 3) return [];
  const icons = elements.filter((el) => isDecorative(el));
  const byId = new Map(elements.map((el) => [el.id, el]));
  const labelOf = (card: ExcalidrawElement): string => {
    if (typeof card.text === "string" && card.text) return card.text;
    const bound = (card.boundElements ?? []).find((b) => b.type === "text");
    const t = bound ? byId.get(bound.id) : undefined;
    if (t && typeof t.text === "string") return t.text;
    // fall back to a free text overlapping the card
    for (const el of elements) {
      if (isText(el) && !el.containerId && overlapRatio(elementBBox(card), elementBBox(el)) > 0.3) {
        return String(el.text ?? "");
      }
    }
    return "";
  };
  const issues: LintIssue[] = [];
  for (const card of cards) {
    const label = labelOf(card);
    if (!resolveConcept(label)) continue; // unrecognized → primitive card is fine
    const cardBox = elementBBox(card);
    const hasIcon = icons.some((ic) => overlapRatio(cardBox, elementBBox(ic)) > 0.05);
    if (!hasIcon) {
      issues.push({
        code: "MISSING_ICON",
        severity: "warning",
        message: `Recognized node "${label.slice(0, 24)}" has no icon — inject the matching glyph.`,
        elementIds: [card.id],
        dimension: "consistency",
        repairable: true,
      });
    }
  }
  return issues;
};

/** Title is not clearly larger than labels / inverted hierarchy (gated by enforceTypography). */
export const detectTypoHierarchy = (
  elements: ExcalidrawElement[],
): LintIssue[] => {
  const texts = elements
    .filter((el) => isText(el) && !isDecorative(el))
    .map((el) => num(el.fontSize, 16));
  if (texts.length < 3) return [];
  const sizes = [...new Set(texts)].sort((a, b) => b - a);
  const top = sizes[0];
  const rest = sizes.slice(1);
  const nextDown = rest.length > 0 ? rest[0] : top;
  // The largest text should read as a title: at least ~1.25× the next size.
  if (sizes.length > 1 && top < nextDown * 1.25) {
    return [
      {
        code: "TYPO_HIERARCHY",
        severity: "info",
        message: `Weak typographic hierarchy — the title (${top}px) is not clearly larger than labels (${nextDown}px).`,
        elementIds: [],
        dimension: "readability",
        repairable: true,
        metrics: { titleSize: top, labelSize: nextDown },
      },
    ];
  }
  return [];
};
