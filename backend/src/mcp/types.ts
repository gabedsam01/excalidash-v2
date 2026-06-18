/**
 * Shared types for the ExcaliDash MCP server (real `/mcp` endpoint).
 *
 * The MCP exposes EXACTLY 25 public tools (see registry/toolRegistry.ts). The
 * LLM is external; the MCP only executes tools. Drawings are persisted in the
 * authenticated user's ExcaliDash workspace.
 */

/** Runtime configuration for the MCP server (built from env in config.ts). */
export interface McpConfig {
  enabled: boolean;
  endpointPath: string;
  minDrawingScore: number;
  maxRepairAttempts: number;
  allowLowScoreDraft: boolean;
  maxElements: number;
  maxExportMb: number;
  defaultLibraryMode: "curated" | "all" | "core" | "specialized" | "public";
  /**
   * How strictly library/icon usage is enforced in scoring:
   *   off      — never flag missing library usage
   *   curated  — recommend libraries (available via lint flags, not auto-enforced)
   *   required — a rich diagram with no library/icon items is a hard blocker
   */
  libraryMode?: "off" | "curated" | "required";
  publicSearchEnabled: boolean;
  rateLimitWindowSeconds: number;
  rateLimitMax: number;
  validateOrigin: boolean;
}

/** Minimal Excalidraw element. Permissive — extra fields are preserved. */
export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: Array<{ id: string; type: string }> | null;
  updated: number;
  link: string | null;
  locked: boolean;
  // Text
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  baseline?: number;
  // Linear (arrow/line)
  points?: Array<[number, number]>;
  lastCommittedPoint?: [number, number] | null;
  startBinding?: { elementId: string; focus: number; gap: number } | null;
  endBinding?: { elementId: string; focus: number; gap: number } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  // Frame
  name?: string | null;
  [key: string]: unknown;
}

/** A complete Excalidraw scene (the `.excalidraw` document shape). */
export interface ExcalidrawScene {
  type: "excalidraw";
  version: number;
  source: string;
  elements: ExcalidrawElement[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** Axis-aligned bounding box. */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A single quality/geometry issue found by the linter. */
export interface LintIssue {
  /** Stable machine code, e.g. "TEXT_OVERFLOW", "OVERLAP", "ARROW_UNBOUND". */
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** Affected element ids (may be empty for scene-level issues). */
  elementIds: string[];
  /** Quality dimension this issue counts against (for the score breakdown). */
  dimension: QualityDimension;
  /** Whether `repair_drawing` can auto-fix this issue. */
  repairable: boolean;
  /** Geometric measurements backing this issue (areas, ratios, distances). */
  metrics?: Record<string, number>;
}

/**
 * A mathematically-proven defect that caps the score below the passing bar
 * regardless of how few other issues exist (e.g. an arrow over readable text).
 */
export interface HardBlocker {
  type: string;
  severity: "error";
  elementIds: string[];
  /** Convenience pointers when the blocker is an arrow-over-text crossing. */
  arrowId?: string;
  textId?: string;
  intersectionArea?: number;
  message: string;
  metrics?: Record<string, number>;
}

/** A single numeric receipt for the score (what was measured, vs. threshold). */
export interface MathEvidenceItem {
  code: string;
  metric: string;
  value: number;
  threshold?: number;
  elementIds: string[];
}

export type QualityDimension =
  | "layout"
  | "containment"
  | "connections"
  | "spacing"
  | "readability"
  | "consistency"
  | "structure";

export interface ScoreBreakdown {
  dimension: QualityDimension;
  score: number;
  weight: number;
  issueCount: number;
}

export interface DrawingScore {
  score: number;
  passed: boolean;
  minimumScore: number;
  issues: LintIssue[];
  repairSuggestions: string[];
  breakdown: ScoreBreakdown[];
  /** Defects that hard-cap the score below the passing bar. */
  hardBlockers: HardBlocker[];
  /** Numeric receipts (areas/ratios/distances) behind the score. */
  mathematicalEvidence: MathEvidenceItem[];
  /** Ordered, actionable plan to clear the issues. */
  repairPlan: string[];
}

/** Authenticated MCP caller (resolved from the Bearer API key). */
export interface McpPrincipal {
  userId: string;
  apiKeyId: string;
}

/** MCP tool-call result content (text blocks, MCP-style). */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** Structured data echoed for clients that read structuredContent. */
  structuredContent?: unknown;
}
