/**
 * Concept → icon resolver. Given a node label ("PostgreSQL 16 :5432",
 * "API · NestJS", "Auth service"), deterministically pick the best icon to
 * inject — SERVER-SIDE, so the model never has to guess an itemName.
 *
 * Resolution is lexical over a normalized label vs. each icon's concept
 * aliases, with brand specificity as a tiebreaker (NestJS beats generic API;
 * Postgres beats generic Database). Unrecognized labels return null so the
 * caller falls back to a clean primitive card.
 *
 * Today candidates come from the always-available bundled glyph set. The shape
 * is forward-compatible with remote catalog candidates (provenance "remote").
 */
import {
  BUNDLED_ICONS,
  getBundledIcon,
  type BundledIcon,
  type RawElement,
} from "./bundled/glyphs";
import { BUNDLED_LIBRARY_ID } from "./bundled";

export interface ConceptCandidate {
  libraryId: string;
  itemName: string;
  /** Internal stable icon id (e.g. "postgres"). */
  iconId: string;
  score: number;
  bbox: { width: number; height: number };
  strokeColor?: string;
  roughness?: number;
  aliases: string[];
  provenance: "remote" | "bundled";
}

const INK = "#1e1e1e";
const GLYPH_BOX = 88;

/** Lower-case, strip accents, collapse non-alphanumerics to single spaces. */
export const normalizeLabel = (label: string): string =>
  String(label ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (normalized: string): string[] =>
  normalized.split(" ").filter((t) => t.length > 0);

/** Score one icon against a normalized label + its tokens. 0 = no match. */
const scoreIcon = (
  icon: BundledIcon,
  normalized: string,
  tokens: string[],
): number => {
  const tokenSet = new Set(tokens);
  const collapsed = normalized.replace(/ /g, "");
  let best = 0;
  for (const concept of icon.concepts) {
    const conceptTokens = concept.split("-");
    if (tokenSet.has(concept)) {
      best = Math.max(best, 12); // exact token match
    } else if (
      conceptTokens.length > 1 &&
      conceptTokens.every((t) => tokenSet.has(t))
    ) {
      best = Math.max(best, 11); // multi-word concept fully present as tokens
    } else if (concept.length >= 3 && collapsed.includes(concept.replace(/-/g, ""))) {
      best = Math.max(best, 6); // substring of the joined label
    } else if (
      concept.length >= 4 &&
      tokens.some((t) => t.length >= 4 && (t.startsWith(concept) || concept.startsWith(t)))
    ) {
      best = Math.max(best, 4); // prefix overlap
    }
  }
  if (best === 0) return 0;
  return best + (icon.brand ? 2 : 0); // brand specificity tiebreaker
};

/** All matching icons for a label, ranked best-first. */
export const resolveConceptCandidates = (label: string): ConceptCandidate[] => {
  const normalized = normalizeLabel(label);
  if (!normalized) return [];
  const tokens = tokenize(normalized);
  const scored: ConceptCandidate[] = [];
  for (const icon of BUNDLED_ICONS) {
    const score = scoreIcon(icon, normalized, tokens);
    if (score <= 0) continue;
    scored.push({
      libraryId: BUNDLED_LIBRARY_ID,
      itemName: icon.name,
      iconId: icon.id,
      score,
      bbox: { width: GLYPH_BOX, height: GLYPH_BOX },
      strokeColor: INK,
      roughness: 0,
      aliases: icon.concepts,
      provenance: "bundled",
    });
  }
  return scored.sort((a, b) => b.score - a.score);
};

/** Best icon candidate for a label, or null when nothing recognized. */
export const resolveConcept = (label: string): ConceptCandidate | null =>
  resolveConceptCandidates(label)[0] ?? null;

/** Fresh injectable glyph elements for a resolved icon id. */
export const iconElements = (iconId: string): RawElement[] => {
  const icon = getBundledIcon(iconId);
  return icon ? icon.build() : [];
};
