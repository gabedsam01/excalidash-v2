/**
 * score_drawing — turn lint issues into an explainable 0-100 quality score.
 *
 * Two things make the score honest (not the old "99 for a bad drawing"):
 *   1. HARD BLOCKERS — geometric defects that prove the drawing is unreadable
 *      (an arrow over text, content over a frame title, stacked duplicates, text
 *      overflow, an item stranded outside its frame). ANY hard blocker caps the
 *      score below the passing bar and forces passed=false, regardless of how
 *      few other issues exist.
 *   2. MATHEMATICAL EVIDENCE — every penalty is backed by a measured number
 *      (intersection area, overlap ratio, font size, overflow px) so the score
 *      is auditable.
 */
import type {
  DrawingScore,
  ExcalidrawScene,
  HardBlocker,
  LintIssue,
  MathEvidenceItem,
  QualityDimension,
  ScoreBreakdown,
} from "../types";
import { lintScene, type LintOptions } from "./lint";

const PENALTY: Record<LintIssue["severity"], number> = {
  error: 9,
  warning: 4,
  info: 1,
};

const DIMENSIONS: QualityDimension[] = [
  "layout",
  "containment",
  "connections",
  "spacing",
  "readability",
  "consistency",
  "structure",
];

const DIMENSION_WEIGHT: Record<QualityDimension, number> = {
  layout: 20,
  containment: 20,
  connections: 15,
  structure: 15,
  readability: 12,
  spacing: 10,
  consistency: 8,
};

/**
 * Fold DIMENSION_WEIGHT into the headline number: a penalty in a heavy
 * dimension (layout/containment) moves the score more than one in a light
 * dimension (consistency). Factors are normalized so the average is 1.0, which
 * keeps overall score magnitudes comparable to the old flat sum.
 */
const AVG_DIMENSION_WEIGHT =
  Object.values(DIMENSION_WEIGHT).reduce((sum, w) => sum + w, 0) /
  Object.keys(DIMENSION_WEIGHT).length;

const dimensionFactor = (dimension: QualityDimension): number =>
  DIMENSION_WEIGHT[dimension] / AVG_DIMENSION_WEIGHT;

const weightedPenalty = (issue: LintIssue): number =>
  PENALTY[issue.severity] * dimensionFactor(issue.dimension);

/**
 * Codes that, when present as errors, hard-cap the score below the passing bar.
 * These are the mathematically-proven "the drawing is broken" defects.
 */
const HARD_BLOCKER_CODES = new Set<string>([
  "ARROW_TEXT_INTERSECTION",
  "FRAME_TITLE_OVERLAP",
  "DUPLICATE_SHAPES",
  "TEXT_OVERFLOW",
  "ITEM_OUTSIDE_FRAME",
  "EMPTY_SCENE",
  "NO_LIBRARY_USAGE",
]);

/** Score ceiling whenever any hard blocker is present (well below the bar). */
const HARD_BLOCKER_CAP = 84;

const BLOCKER_TYPE: Record<string, string> = {
  ARROW_TEXT_INTERSECTION: "ARROW_TEXT_INTERSECTION",
  FRAME_TITLE_OVERLAP: "FRAME_TITLE_OVERLAP",
  DUPLICATE_SHAPES: "DUPLICATE_SHAPES",
  TEXT_OVERFLOW: "TEXT_OVERFLOW",
  ITEM_OUTSIDE_FRAME: "ITEM_OUTSIDE_FRAME",
  EMPTY_SCENE: "EMPTY_SCENE",
  NO_LIBRARY_USAGE: "MISSING_LIBRARY_USAGE",
};

const SUGGESTION: Record<string, string> = {
  ARROW_TEXT_INTERSECTION:
    "Reroute the arrow through a gutter or move the label off the arrow path.",
  FRAME_TITLE_OVERLAP: "Lower content below the frame's reserved title band.",
  TEXT_OVERFLOW: "Grow the card or shrink the label so text fits inside.",
  SMALL_CARD: "Increase the card to at least 120×56 px.",
  OVERLAP: "Separate overlapping shapes (increase spacing).",
  DUPLICATE_SHAPES: "Remove or separate stacked/duplicate shapes.",
  ARROW_UNBOUND: "Bind arrows to their start and end elements.",
  ITEM_OUTSIDE_FRAME: "Grow the frame to contain the item (or clear its frame).",
  OFF_GRID: "Snap elements to the grid.",
  SMALL_FONT: "Raise the font size to at least the readable minimum.",
  FRAME_NO_TITLE: "Give every frame a title.",
  TEXT_NEAR_EDGE: "Add padding so labels don't touch the frame border.",
  CROSSING_ARROWS: "Route connectors through gutters/lanes to reduce crossings.",
  HIGH_DENSITY: "Spread elements out — reduce per-region density.",
  NO_LIBRARY_USAGE: "Add curated library/icon items in card icon slots.",
  RECTANGLE_ONLY: "Use icons/symbols/library items instead of bare rectangles.",
  MISSING_LEGEND: "Add a legend explaining the symbols and zones.",
  STYLE_DRIFT: "Lock one stroke/roughness/font family across the diagram.",
  TOO_MANY_COLORS: "Reduce to at most 3 hue families; tint by layer.",
  LOW_CONTRAST: "Raise text/background contrast to at least WCAG AA (4.5:1).",
  MISSING_ICON: "Inject the matching library/icon glyph into the recognized node.",
  TYPO_HIERARCHY: "Make the title clearly larger than labels (title>label>caption).",
  DENSE_CONNECTORS: "Reduce connector density or group related edges.",
  EDGE_CROSSING_HEAVY: "Reroute connectors through lanes to cut crossings.",
};

/** Order in which the repair plan should attack issues (highest first). */
const PLAN_ORDER = [
  "EMPTY_SCENE",
  "TEXT_OVERFLOW",
  "SMALL_FONT",
  "SMALL_CARD",
  "DUPLICATE_SHAPES",
  "ARROW_TEXT_INTERSECTION",
  "FRAME_TITLE_OVERLAP",
  "ITEM_OUTSIDE_FRAME",
  "OVERLAP",
  "CROSSING_ARROWS",
  "ARROW_UNBOUND",
  "TEXT_NEAR_EDGE",
  "OFF_GRID",
  "HIGH_DENSITY",
  "DENSE_CONNECTORS",
  "EDGE_CROSSING_HEAVY",
  "NO_LIBRARY_USAGE",
  "MISSING_ICON",
  "RECTANGLE_ONLY",
  "TOO_MANY_COLORS",
  "STYLE_DRIFT",
  "LOW_CONTRAST",
  "TYPO_HIERARCHY",
  "MISSING_LEGEND",
];

const isBlocker = (issue: LintIssue): boolean =>
  issue.severity === "error" && HARD_BLOCKER_CODES.has(issue.code);

const toBlocker = (issue: LintIssue): HardBlocker => {
  const blocker: HardBlocker = {
    type: BLOCKER_TYPE[issue.code] ?? issue.code,
    severity: "error",
    elementIds: issue.elementIds,
    message: issue.message,
    metrics: issue.metrics,
  };
  if (issue.code === "ARROW_TEXT_INTERSECTION") {
    blocker.arrowId = issue.elementIds[0];
    blocker.textId = issue.elementIds[1];
    blocker.intersectionArea = issue.metrics?.intersectionArea;
  }
  return blocker;
};

const evidenceFrom = (issues: LintIssue[]): MathEvidenceItem[] => {
  const evidence: MathEvidenceItem[] = [];
  for (const issue of issues) {
    if (!issue.metrics) continue;
    for (const [metric, value] of Object.entries(issue.metrics)) {
      evidence.push({
        code: issue.code,
        metric,
        value,
        elementIds: issue.elementIds,
      });
    }
  }
  return evidence;
};

const buildRepairPlan = (issues: LintIssue[]): string[] => {
  const present = new Set(issues.map((i) => i.code));
  const plan: string[] = [];
  for (const code of PLAN_ORDER) {
    if (present.has(code)) {
      const count = issues.filter((i) => i.code === code).length;
      plan.push(`${SUGGESTION[code] ?? code}${count > 1 ? ` (×${count})` : ""}`);
    }
  }
  return plan;
};

export const scoreIssues = (
  issues: LintIssue[],
  minimumScore: number,
): DrawingScore => {
  const totalPenalty = issues.reduce(
    (sum, issue) => sum + weightedPenalty(issue),
    0,
  );
  let score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  const hardBlockers = issues.filter(isBlocker).map(toBlocker);
  if (hardBlockers.length > 0) {
    // Every additional blocker drags the ceiling down further.
    score = Math.min(score, HARD_BLOCKER_CAP - (hardBlockers.length - 1) * 4);
    score = Math.max(0, score);
  }

  const breakdown: ScoreBreakdown[] = DIMENSIONS.map((dimension) => {
    const dimensionIssues = issues.filter((i) => i.dimension === dimension);
    const dimensionPenalty = dimensionIssues.reduce(
      (sum, i) => sum + PENALTY[i.severity],
      0,
    );
    return {
      dimension,
      score: Math.max(0, Math.min(100, Math.round(100 - dimensionPenalty * 1.2))),
      weight: DIMENSION_WEIGHT[dimension],
      issueCount: dimensionIssues.length,
    };
  });

  const repairSuggestions = Array.from(
    new Set(
      issues
        .filter((i) => i.repairable)
        .map((i) => SUGGESTION[i.code] ?? i.message),
    ),
  );

  return {
    score,
    // A hard blocker ALWAYS fails, regardless of the configured minimum.
    passed: score >= minimumScore && hardBlockers.length === 0,
    minimumScore,
    issues,
    repairSuggestions,
    breakdown,
    hardBlockers,
    mathematicalEvidence: evidenceFrom(issues),
    repairPlan: buildRepairPlan(issues),
  };
};

export const scoreScene = (
  scene: ExcalidrawScene,
  minimumScore: number,
  overrides: Partial<LintOptions> = {},
): DrawingScore => scoreIssues(lintScene(scene, overrides), minimumScore);
