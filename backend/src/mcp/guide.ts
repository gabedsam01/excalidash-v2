/**
 * read_mcp_guide content — how to use the ExcaliDash MCP: tools, limits, visual
 * standards, presets, quality flow and best practices.
 */
import type { McpConfig } from "./types";
import { listPresets } from "./templates/presets";
import { listTemplates } from "./templates/templates";
import { ARCHITECTURE_PATTERN_IDS } from "./architecture/patterns";
import { PROMPT_NAMES } from "./prompts/registry";

export interface McpGuide {
  name: string;
  description: string;
  authentication: string;
  qualityFlow: string[];
  minimumScore: number;
  limits: {
    maxElements: number;
    maxExportMb: number;
    rateLimitMax: number;
    rateLimitWindowSeconds: number;
  };
  acceptedDiagramTypes: string[];
  presets: Array<{ id: string; name: string }>;
  templates: ReturnType<typeof listTemplates>;
  architecturePatterns: string[];
  libraryPolicy: {
    defaultMode: string;
    enforcement: string;
    publicSearchEnabled: boolean;
    note: string;
  };
  prompts: {
    count: number;
    note: string;
    commandFormat: string;
  };
  claudeCodeSkills: {
    count: number;
    note: string;
    install: string[];
  };
  bestPractices: string[];
  exportFormats: string[];
}

export const buildGuide = (config: McpConfig): McpGuide => ({
  name: "ExcaliDash MCP",
  description:
    "Create, edit, validate, repair, version, export and save professional Excalidraw diagrams in your ExcaliDash workspace. The LLM is external; this MCP only executes 25 deterministic tools.",
  authentication:
    "Send Authorization: Bearer exd_... (an ExcaliDash API key). Each key only accesses its owner's drawings, libraries and exports.",
  qualityFlow: [
    "1. Generate (create_diagram_from_prompt / create_from_template / create_from_repo_analysis).",
    "2. lint_drawing to find geometric/structural issues.",
    "3. score_drawing (0-100). The passing bar is the minimum score.",
    `4. If score < ${config.minDrawingScore}: repair_drawing or auto_polish_drawing.`,
    "5. save_drawing once it passes (or as a draft if low-score drafts are allowed).",
    "6. get_drawing_url / export_drawing to share.",
  ],
  minimumScore: config.minDrawingScore,
  limits: {
    maxElements: config.maxElements,
    maxExportMb: config.maxExportMb,
    rateLimitMax: config.rateLimitMax,
    rateLimitWindowSeconds: config.rateLimitWindowSeconds,
  },
  acceptedDiagramTypes: [
    "flowchart",
    "architecture",
    "c4",
    "sequence",
    "swimlane",
    "workflow",
    "database",
    "wireframe",
    "security",
    "mcp",
  ],
  presets: listPresets(),
  templates: listTemplates(),
  architecturePatterns: ARCHITECTURE_PATTERN_IDS,
  libraryPolicy: {
    defaultMode: config.defaultLibraryMode,
    enforcement: config.libraryMode ?? "curated",
    publicSearchEnabled: config.publicSearchEnabled,
    note: "Prefer curated CORE/SPECIALIZED packs. Use cache_library before add_library_items_normalized. In MCP_LIBRARY_MODE=required, a rich diagram with no library/icon items is a hard blocker.",
  },
  prompts: {
    count: PROMPT_NAMES.length,
    note: "25 MCP prompts are exposed via prompts/list and appear in Claude Code as commands once the MCP is connected.",
    commandFormat: "/mcp__excalidash__<prompt_name>",
  },
  claudeCodeSkills: {
    count: 25,
    note: "25 optional Claude Code skills can be installed/copied locally (they are NOT installed by `claude mcp add`).",
    install: [
      "npx -y @excalidash/claude-skills install --scope user",
      "npx -y @excalidash/claude-skills install --scope project --project-dir .",
      "node packages/excalidash-claude-skills/bin/install.cjs install --scope user",
    ],
  },
  bestPractices: [
    "Always run the quality flow before saving as final.",
    "Use labeled, on-grid cards with bound arrows (no dangling arrows).",
    "Keep text inside its container and font sizes readable (≥ 16px).",
    "Prefer curated libraries for visual consistency.",
    "Normalize imported library items with add_library_items_normalized.",
    "Use frames with titles to group regions.",
  ],
  exportFormats: ["excalidraw", "svg", "png (fallback: svg / editable URL)"],
});

export const guideToMarkdown = (guide: McpGuide): string =>
  [
    `# ${guide.name}`,
    "",
    guide.description,
    "",
    `## Authentication`,
    guide.authentication,
    "",
    `## Quality flow (minimum score: ${guide.minimumScore})`,
    ...guide.qualityFlow,
    "",
    `## Limits`,
    `- Max elements: ${guide.limits.maxElements}`,
    `- Max export: ${guide.limits.maxExportMb} MB`,
    `- Rate limit: ${guide.limits.rateLimitMax} / ${guide.limits.rateLimitWindowSeconds}s`,
    "",
    `## Diagram types`,
    guide.acceptedDiagramTypes.join(", "),
    "",
    `## Presets`,
    guide.presets.map((p) => `- ${p.id} (${p.name})`).join("\n"),
    "",
    `## Library policy`,
    `- Default mode: ${guide.libraryPolicy.defaultMode}`,
    `- Enforcement (MCP_LIBRARY_MODE): ${guide.libraryPolicy.enforcement}`,
    `- Public search enabled: ${guide.libraryPolicy.publicSearchEnabled}`,
    `- ${guide.libraryPolicy.note}`,
    "",
    `## MCP prompts (${guide.prompts.count})`,
    `- ${guide.prompts.note}`,
    `- Command format: ${guide.prompts.commandFormat}`,
    "",
    `## Claude Code skills (${guide.claudeCodeSkills.count})`,
    `- ${guide.claudeCodeSkills.note}`,
    ...guide.claudeCodeSkills.install.map((c) => `- \`${c}\``),
    "",
    `## Best practices`,
    guide.bestPractices.map((b) => `- ${b}`).join("\n"),
  ].join("\n");
