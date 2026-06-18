/**
 * The 25 public ExcaliDash MCP tools. EXACTLY 25 — no more, no less. Each tool
 * has a Zod input schema (validation) and a JSON Schema (tools/list, derived via
 * Zod 4's native z.toJSONSchema). Handlers are deterministic and ownership-scoped.
 */
import { z } from "zod";
import type {
  ExcalidrawElement,
  ExcalidrawScene,
  McpConfig,
  McpPrincipal,
  ToolResult,
} from "../types";
import { invalid } from "../errors";
import { toScene } from "../excalidraw/elements";
import { lintScene, type LintOptions } from "../quality/lint";
import { scoreScene } from "../quality/score";
import { repairScene } from "../quality/repair";
import { autoPolish } from "../quality/autopolish";
import { generateDiagramScene } from "../generate/diagram";
import { renderTemplate, listTemplates } from "../templates/templates";
import { listPresets } from "../templates/presets";
import { exportScene, type ExportFormat } from "../drawings/exportService";
import { extractGraph } from "../architecture/graphFromScene";
import { validateArchitecture } from "../architecture/validator";
import {
  applyArchitectureSkill,
  ARCHITECTURE_PATTERN_IDS,
  buildFromRepoAnalysis,
  convertDiagram,
  suggestImprovements,
} from "../architecture/patterns";
import { buildGuide, guideToMarkdown } from "../guide";
import { listSkills } from "../skills/registry";
import { redactValue } from "../security/redaction";
import type { DrawingService } from "../drawings/drawingService";
import type { LibraryAdapter } from "../libraries/libraryAdapter";
import type { LibrarySearchMode } from "../../libraries/types";

export interface ToolContext {
  principal: McpPrincipal;
  config: McpConfig;
  drawingService: DrawingService;
  libraryAdapter: LibraryAdapter;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  handler: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

// Every tool response is redacted: secrets in user-supplied scenes/analysis/
// labels must never appear in a tool result, log or transcript.
const ok = (data: unknown): ToolResult => {
  const safe = redactValue(data);
  return {
    content: [{ type: "text", text: JSON.stringify(safe, null, 2) }],
    structuredContent: safe,
  };
};

const sceneFields = {
  id: z.string().min(1).max(200).optional(),
  scene: z.record(z.string(), z.any()).optional(),
  elements: z.array(z.record(z.string(), z.any())).optional(),
};

const coerceScene = (
  args: { scene?: unknown; elements?: unknown },
  maxElements: number,
): ExcalidrawScene => {
  let elements: ExcalidrawElement[] | null = null;
  let appState: Record<string, unknown> = {};
  let files: Record<string, unknown> = {};
  if (
    args.scene &&
    typeof args.scene === "object" &&
    Array.isArray((args.scene as { elements?: unknown }).elements)
  ) {
    const s = args.scene as ExcalidrawScene;
    elements = s.elements as ExcalidrawElement[];
    appState = (s.appState as Record<string, unknown>) ?? {};
    files = (s.files as Record<string, unknown>) ?? {};
  } else if (Array.isArray(args.elements)) {
    elements = args.elements as ExcalidrawElement[];
  }
  if (!elements) {
    throw invalid("Provide a drawing `id`, a `scene`, or `elements`.");
  }
  if (elements.length > maxElements) {
    throw invalid(`Scene has ${elements.length} elements; the limit is ${maxElements}.`);
  }
  return { ...toScene(elements, appState), files };
};

/** Resolve a scene from {id} (ownership-scoped) or inline {scene|elements}. */
const resolveScene = async (
  args: { id?: string; scene?: unknown; elements?: unknown },
  ctx: ToolContext,
): Promise<ExcalidrawScene> => {
  if (args.id) {
    const drawing = await ctx.drawingService.getDrawing(
      ctx.principal.userId,
      args.id,
      { includeData: true },
    );
    if (!drawing.scene) throw invalid("Drawing has no scene data.");
    return drawing.scene;
  }
  return coerceScene(args, ctx.config.maxElements);
};

const resolveGraph = async (
  args: { id?: string; scene?: unknown; elements?: unknown; structure?: unknown },
  ctx: ToolContext,
) => {
  if (
    args.structure &&
    typeof args.structure === "object" &&
    Array.isArray((args.structure as { nodes?: unknown }).nodes)
  ) {
    const s = args.structure as {
      nodes: Array<{ id: string; label: string }>;
      edges?: Array<{ from: string; to: string; label?: string }>;
    };
    return { nodes: s.nodes, edges: s.edges ?? [] };
  }
  return extractGraph(await resolveScene(args, ctx));
};

/** Lint overrides derived from config — only "required" mode enforces libraries. */
const strictLintOptions = (config: McpConfig): Partial<LintOptions> =>
  config.libraryMode === "required"
    ? { requireLibrary: true, libraryRequiredSeverity: "error" }
    : {};

const polishAndMaybeSave = async (
  scene: ExcalidrawScene,
  args: {
    id?: string;
    save?: boolean;
    name?: string;
    autoPolish?: boolean;
    createVersion?: boolean;
    allowDraft?: boolean;
  },
  ctx: ToolContext,
) => {
  const lintOverrides = strictLintOptions(ctx.config);
  let finalScene = scene;
  let polish: ReturnType<typeof autoPolish> | null = null;
  if (args.autoPolish !== false) {
    polish = autoPolish(scene, {
      minimumScore: ctx.config.minDrawingScore,
      maxAttempts: ctx.config.maxRepairAttempts,
      lintOptions: lintOverrides,
    });
    finalScene = polish.scene;
  }
  const score = polish
    ? polish.score
    : scoreScene(finalScene, ctx.config.minDrawingScore, lintOverrides);

  let saved: { drawingId: string; editUrl: string | null } | null = null;
  const allowDraft = args.allowDraft ?? ctx.config.allowLowScoreDraft;
  if (args.save && (score.passed || allowDraft)) {
    if (args.id) {
      const summary = await ctx.drawingService.updateDrawing(
        ctx.principal.userId,
        args.id,
        { name: args.name, scene: finalScene, createVersion: true },
      );
      const url = await ctx.drawingService.getDrawingUrl(
        ctx.principal.userId,
        summary.id,
      );
      saved = { drawingId: summary.id, editUrl: url.url };
    } else {
      const summary = await ctx.drawingService.createDrawing(
        ctx.principal.userId,
        { name: args.name ?? "Untitled diagram", scene: finalScene },
      );
      const url = await ctx.drawingService.getDrawingUrl(
        ctx.principal.userId,
        summary.id,
      );
      saved = { drawingId: summary.id, editUrl: url.url };
    }
  }

  return {
    scene: finalScene,
    elementCount: finalScene.elements.length,
    score,
    polish: polish
      ? { attempts: polish.attempts, passed: polish.passed, history: polish.history }
      : null,
    saved,
    savedAsDraft: Boolean(saved) && !score.passed,
  };
};

export const buildToolRegistry = (): McpTool[] => {
  const tools: McpTool[] = [];
  const tool = (
    name: string,
    description: string,
    inputSchema: z.ZodTypeAny,
    handler: McpTool["handler"],
  ) => {
    let jsonSchema: Record<string, unknown>;
    try {
      jsonSchema = z.toJSONSchema(inputSchema, {
        target: "draft-7",
      }) as Record<string, unknown>;
      delete jsonSchema.$schema;
    } catch {
      jsonSchema = { type: "object", properties: {} };
    }
    tools.push({ name, description, inputSchema, jsonSchema, handler });
  };

  // ---- Core (9) --------------------------------------------------------
  tool(
    "read_mcp_guide",
    "Return the ExcaliDash MCP usage guide: tools, limits, visual standards, presets, quality flow and best practices.",
    z.object({}),
    async (_args, ctx) => {
      const guide = buildGuide(ctx.config);
      return {
        content: [{ type: "text", text: guideToMarkdown(guide) }],
        structuredContent: guide,
      };
    },
  );

  tool(
    "create_drawing",
    "Create an empty drawing or one from a validated Excalidraw scene/elements, owned by the authenticated user.",
    z.object({
      name: z.string().min(1).max(255),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      collectionId: z.string().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as {
        name: string;
        scene?: unknown;
        elements?: unknown;
        collectionId?: string;
      };
      const hasScene = args.scene || args.elements;
      const scene = hasScene
        ? coerceScene(args, ctx.config.maxElements)
        : toScene([]);
      const summary = await ctx.drawingService.createDrawing(
        ctx.principal.userId,
        { name: args.name, scene, collectionId: args.collectionId ?? null },
      );
      const url = await ctx.drawingService.getDrawingUrl(
        ctx.principal.userId,
        summary.id,
      );
      return ok({ ...summary, editUrl: url.url });
    },
  );

  tool(
    "create_diagram_from_prompt",
    "Create a complete diagram from a prompt or structured input, with a visual preset and the quality flow (auto-polish) applied.",
    z.object({
      prompt: z.string().optional(),
      diagramType: z.string().optional(),
      structure: z.record(z.string(), z.any()).optional(),
      preset: z.string().optional(),
      title: z.string().optional(),
      direction: z.enum(["TB", "LR"]).optional(),
      autoPolish: z.boolean().optional(),
      save: z.boolean().optional(),
      name: z.string().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = generateDiagramScene({
        prompt: args.prompt as string | undefined,
        diagramType: args.diagramType as string | undefined,
        structure: args.structure as never,
        presetId: args.preset as string | undefined,
        title: args.title as string | undefined,
        direction: args.direction as "TB" | "LR" | undefined,
      });
      const result = await polishAndMaybeSave(
        scene,
        {
          save: args.save as boolean | undefined,
          name: (args.name as string) ?? (args.title as string),
          autoPolish: args.autoPolish as boolean | undefined,
        },
        ctx,
      );
      return ok(result);
    },
  );

  tool(
    "update_drawing",
    "Apply a safe patch to an existing drawing (name/scene/elements), preserving ownership; optionally snapshot a version first.",
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      createVersion: z.boolean().optional(),
      collectionId: z.string().nullable().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene =
        args.scene || args.elements
          ? coerceScene(args, ctx.config.maxElements)
          : undefined;
      const summary = await ctx.drawingService.updateDrawing(
        ctx.principal.userId,
        args.id as string,
        {
          name: args.name as string | undefined,
          scene,
          createVersion: args.createVersion as boolean | undefined,
          collectionId: args.collectionId as string | null | undefined,
        },
      );
      return ok(summary);
    },
  );

  tool(
    "get_drawing",
    "Fetch a saved drawing (ownership-scoped). Returns metadata and, when includeData=true, the full scene.",
    z.object({
      id: z.string().min(1),
      includeData: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as { id: string; includeData?: boolean };
      const drawing = await ctx.drawingService.getDrawing(
        ctx.principal.userId,
        args.id,
        { includeData: args.includeData },
      );
      return ok(drawing);
    },
  );

  tool(
    "save_drawing",
    "Save a drawing into the authenticated workspace. By default it is not saved as final when score < minimum, unless saved as a draft.",
    z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      asDraft: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = coerceScene(args, ctx.config.maxElements);
      const score = scoreScene(scene, ctx.config.minDrawingScore);
      const allowDraft =
        (args.asDraft as boolean | undefined) ?? false
          ? ctx.config.allowLowScoreDraft
          : false;
      if (!score.passed && !allowDraft) {
        return ok({
          saved: false,
          reason: `Score ${score.score} is below the minimum ${score.minimumScore}.`,
          score,
          hint: "Call auto_polish_drawing, or save with asDraft=true if low-score drafts are allowed.",
        });
      }
      const summary = args.id
        ? await ctx.drawingService.updateDrawing(
            ctx.principal.userId,
            args.id as string,
            { name: args.name as string | undefined, scene, createVersion: true },
          )
        : await ctx.drawingService.createDrawing(ctx.principal.userId, {
            name: (args.name as string) ?? "Untitled diagram",
            scene,
          });
      const url = await ctx.drawingService.getDrawingUrl(
        ctx.principal.userId,
        summary.id,
      );
      return ok({
        saved: true,
        savedAsDraft: !score.passed,
        drawing: summary,
        editUrl: url.url,
        score,
      });
    },
  );

  tool(
    "save_version",
    "Create a version snapshot of a drawing for history/rollback.",
    z.object({ id: z.string().min(1) }),
    async (raw, ctx) => {
      const args = raw as { id: string };
      const result = await ctx.drawingService.snapshot(
        ctx.principal.userId,
        args.id,
      );
      return ok({ id: args.id, snapshotVersion: result.version, created: true });
    },
  );

  tool(
    "get_drawing_url",
    "Return the editable/shareable URL for a drawing, respecting ownership.",
    z.object({ id: z.string().min(1) }),
    async (raw, ctx) => {
      const args = raw as { id: string };
      const url = await ctx.drawingService.getDrawingUrl(
        ctx.principal.userId,
        args.id,
      );
      return ok(url);
    },
  );

  tool(
    "export_drawing",
    "Export a drawing as .excalidraw, SVG, or PNG (PNG falls back to SVG/editable URL when headless raster is unavailable).",
    z.object({
      id: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      format: z.enum(["excalidraw", "svg", "png"]).optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = await resolveScene(args, ctx);
      const result = exportScene(
        scene,
        (args.format as ExportFormat) ?? "excalidraw",
        ctx.config.maxExportMb * 1024 * 1024,
      );
      return ok(result);
    },
  );

  // ---- Libraries (5) ---------------------------------------------------
  tool(
    "search_libraries",
    "Search curated CORE/SPECIALIZED packs or the official PUBLIC catalog (mode=all/core/specialized/public).",
    z.object({
      q: z.string().optional(),
      mode: z.enum(["core", "specialized", "public", "all"]).optional(),
      category: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const result = await ctx.libraryAdapter.search({
        query: args.q as string | undefined,
        mode: args.mode as LibrarySearchMode | undefined,
        category: args.category as string | undefined,
        limit: args.limit as number | undefined,
      });
      return ok(result);
    },
  );

  tool(
    "inspect_library",
    "List a library's metadata and items. If not cached, indicates cached:false (or pass autoCache=true to cache then inspect).",
    z.object({ id: z.string().min(1), autoCache: z.boolean().optional() }),
    async (raw, ctx) => {
      const args = raw as { id: string; autoCache?: boolean };
      const result = await ctx.libraryAdapter.inspect(args.id, args.autoCache);
      return ok(result);
    },
  );

  tool(
    "cache_library",
    "Download and cache a .excalidrawlib on demand (official allowlisted source only, size-limited, hashed, stored on the volume).",
    z.object({ id: z.string().min(1) }),
    async (raw, ctx) => {
      const args = raw as { id: string };
      const result = await ctx.libraryAdapter.cache(args.id);
      return ok(result);
    },
  );

  tool(
    "add_library_items",
    "Add items from a cached library onto a drawing/scene by itemNames or indexes at a target position.",
    z.object({
      libraryId: z.string().min(1),
      id: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      itemNames: z.array(z.string()).optional(),
      indexes: z.array(z.number().int().nonnegative()).optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      limit: z.number().int().positive().max(50).optional(),
      placement: z
        .enum([
          "grid",
          "inside-card-left",
          "inside-card-top",
          "badge",
          "legend",
          "actor",
          "database-symbol",
          "cloud-provider",
          "external-integration-card",
        ])
        .optional(),
      targetCardId: z.string().optional(),
      slotSize: z.number().int().positive().max(400).optional(),
      save: z.boolean().optional(),
    }),
    async (raw, ctx) => addLibraryItemsHandler(raw, ctx, false),
  );

  tool(
    "add_library_items_normalized",
    "Add library items with normalization (scale, grid snap, min font, colors) so imports match the canvas's visual standard.",
    z.object({
      libraryId: z.string().min(1),
      id: z.string().optional(),
      scene: z.record(z.string(), z.any()).optional(),
      elements: z.array(z.record(z.string(), z.any())).optional(),
      itemNames: z.array(z.string()).optional(),
      indexes: z.array(z.number().int().nonnegative()).optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      limit: z.number().int().positive().max(50).optional(),
      placement: z
        .enum([
          "grid",
          "inside-card-left",
          "inside-card-top",
          "badge",
          "legend",
          "actor",
          "database-symbol",
          "cloud-provider",
          "external-integration-card",
        ])
        .optional(),
      targetCardId: z.string().optional(),
      slotSize: z.number().int().positive().max(400).optional(),
      save: z.boolean().optional(),
    }),
    async (raw, ctx) => addLibraryItemsHandler(raw, ctx, true),
  );

  // ---- Quality / geometry (4) ------------------------------------------
  const lintFlagFields = {
    requireLibrary: z.boolean().optional(),
    requireLegend: z.boolean().optional(),
    expectRichArchitecture: z.boolean().optional(),
  };
  const lintOverridesFrom = (
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Partial<LintOptions> => ({
    ...strictLintOptions(ctx.config),
    ...(args.requireLibrary !== undefined
      ? {
          requireLibrary: Boolean(args.requireLibrary),
          libraryRequiredSeverity: "error" as const,
        }
      : {}),
    ...(args.requireLegend !== undefined
      ? { requireLegend: Boolean(args.requireLegend) }
      : {}),
    ...(args.expectRichArchitecture !== undefined
      ? { expectRichArchitecture: Boolean(args.expectRichArchitecture) }
      : {}),
  });

  tool(
    "lint_drawing",
    "Detect visual, structural and mathematical issues in a scene using the geometry engine (arrow-over-text, frame-title overlaps, density, etc.).",
    z.object({ ...sceneFields, ...lintFlagFields }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = await resolveScene(args, ctx);
      const issues = lintScene(scene, lintOverridesFrom(args, ctx));
      return ok({ issueCount: issues.length, issues });
    },
  );

  tool(
    "score_drawing",
    "Score overall quality 0-100 with hard blockers, mathematical evidence, a per-dimension breakdown and an ordered repair plan (default minimum 95).",
    z.object({
      ...sceneFields,
      ...lintFlagFields,
      minimumScore: z.number().int().min(0).max(100).optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = await resolveScene(args, ctx);
      const result = scoreScene(
        scene,
        (args.minimumScore as number) ?? ctx.config.minDrawingScore,
        lintOverridesFrom(args, ctx),
      );
      return ok(result);
    },
  );

  tool(
    "repair_drawing",
    "Automatically fix detected issues (text overflow, small cards, misalignment, unbound arrows, loose items, overlaps).",
    z.object({
      ...sceneFields,
      save: z.boolean().optional(),
      createVersion: z.boolean().optional(),
      name: z.string().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = await resolveScene(args, ctx);
      const repaired = repairScene(scene);
      const score = scoreScene(repaired.scene, ctx.config.minDrawingScore);
      let saved: { drawingId: string; editUrl: string | null } | null = null;
      if (args.save && args.id) {
        const summary = await ctx.drawingService.updateDrawing(
          ctx.principal.userId,
          args.id as string,
          {
            name: args.name as string | undefined,
            scene: repaired.scene,
            createVersion: (args.createVersion as boolean | undefined) ?? true,
          },
        );
        const url = await ctx.drawingService.getDrawingUrl(
          ctx.principal.userId,
          summary.id,
        );
        saved = { drawingId: summary.id, editUrl: url.url };
      }
      return ok({
        scene: repaired.scene,
        applied: repaired.applied,
        score,
        saved,
      });
    },
  );

  tool(
    "auto_polish_drawing",
    "Run lint → score → repair in a loop until the scene scores ≥ minimum or max attempts is reached.",
    z.object({
      ...sceneFields,
      minimumScore: z.number().int().min(0).max(100).optional(),
      maxAttempts: z.number().int().positive().max(20).optional(),
      save: z.boolean().optional(),
      allowDraft: z.boolean().optional(),
      name: z.string().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = await resolveScene(args, ctx);
      const result = autoPolish(scene, {
        minimumScore:
          (args.minimumScore as number) ?? ctx.config.minDrawingScore,
        maxAttempts:
          (args.maxAttempts as number) ?? ctx.config.maxRepairAttempts,
      });
      let saved: { drawingId: string; editUrl: string | null } | null = null;
      const allowDraft =
        (args.allowDraft as boolean | undefined) ?? ctx.config.allowLowScoreDraft;
      if (args.save && args.id && (result.passed || allowDraft)) {
        const summary = await ctx.drawingService.updateDrawing(
          ctx.principal.userId,
          args.id as string,
          {
            name: args.name as string | undefined,
            scene: result.scene,
            createVersion: true,
          },
        );
        const url = await ctx.drawingService.getDrawingUrl(
          ctx.principal.userId,
          summary.id,
        );
        saved = { drawingId: summary.id, editUrl: url.url };
      }
      return ok({
        scene: result.scene,
        score: result.score,
        passed: result.passed,
        attempts: result.attempts,
        history: result.history,
        saved,
        savedAsDraft: Boolean(saved) && !result.passed,
      });
    },
  );

  // ---- Architecture / code (4) -----------------------------------------
  tool(
    "create_from_repo_analysis",
    "Build a real architecture diagram from a structured repository analysis (modules, entrypoints, database, services, integrations).",
    z.object({
      analysis: z.record(z.string(), z.any()),
      preset: z.string().optional(),
      save: z.boolean().optional(),
      name: z.string().optional(),
      autoPolish: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const scene = buildFromRepoAnalysis(
        args.analysis as never,
        args.preset as string | undefined,
      );
      const result = await polishAndMaybeSave(
        scene,
        {
          save: args.save as boolean | undefined,
          name: (args.name as string) ?? "Repository Architecture",
          autoPolish: args.autoPolish as boolean | undefined,
        },
        ctx,
      );
      return ok(result);
    },
  );

  tool(
    "apply_architecture_skill",
    "Generate a diagram for an architectural pattern (clean, hexagonal, ddd, c4, cqrs, event-driven, microservices, modular-monolith, mcp).",
    z.object({
      pattern: z.enum(ARCHITECTURE_PATTERN_IDS as [string, ...string[]]),
      preset: z.string().optional(),
      title: z.string().optional(),
      save: z.boolean().optional(),
      name: z.string().optional(),
      autoPolish: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const applied = applyArchitectureSkill(
        args.pattern as string,
        args.preset as string | undefined,
        args.title as string | undefined,
      );
      if (!applied) {
        throw invalid(
          `Unknown pattern. Available: ${ARCHITECTURE_PATTERN_IDS.join(", ")}`,
        );
      }
      const result = await polishAndMaybeSave(
        applied.scene,
        {
          save: args.save as boolean | undefined,
          name: (args.name as string) ?? applied.pattern,
          autoPolish: args.autoPolish as boolean | undefined,
        },
        ctx,
      );
      return ok({ pattern: applied.pattern, ...result });
    },
  );

  tool(
    "validate_architecture",
    "Validate architectural coherence (frontend→DB, infra→domain, domain→framework, dependency inversion, missing trust boundary, MCP separation).",
    z.object({
      ...sceneFields,
      structure: z.record(z.string(), z.any()).optional(),
    }),
    async (raw, ctx) => {
      const graph = await resolveGraph(raw as never, ctx);
      const result = validateArchitecture(graph.nodes, graph.edges);
      return ok(result);
    },
  );

  tool(
    "suggest_architecture_improvements",
    "Return prioritized, actionable architecture improvements (by impact and effort).",
    z.object({
      ...sceneFields,
      structure: z.record(z.string(), z.any()).optional(),
    }),
    async (raw, ctx) => {
      const graph = await resolveGraph(raw as never, ctx);
      const result = suggestImprovements(graph.nodes, graph.edges);
      return ok(result);
    },
  );

  // ---- Templates / transformation (3) ----------------------------------
  tool(
    "list_templates",
    "List available templates, visual presets, diagram types, architecture patterns and compatible skills.",
    z.object({}),
    async () =>
      ok({
        templates: listTemplates(),
        presets: listPresets(),
        diagramTypes: [
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
        architecturePatterns: ARCHITECTURE_PATTERN_IDS,
        skills: listSkills().map((s) => ({ id: s.id, name: s.name })),
      }),
  );

  tool(
    "create_from_template",
    "Create a drawing from a built-in template, applying a preset and (optionally) extra nodes/edges.",
    z.object({
      templateId: z.string().min(1),
      preset: z.string().optional(),
      title: z.string().optional(),
      extraNodes: z.array(z.record(z.string(), z.any())).optional(),
      extraEdges: z.array(z.record(z.string(), z.any())).optional(),
      save: z.boolean().optional(),
      name: z.string().optional(),
      autoPolish: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const rendered = renderTemplate(args.templateId as string, {
        presetId: args.preset as string | undefined,
        title: args.title as string | undefined,
        extraNodes: args.extraNodes as never,
        extraEdges: args.extraEdges as never,
      });
      if (!rendered) {
        throw invalid(
          `Unknown templateId. Use list_templates to see valid ids.`,
        );
      }
      const result = await polishAndMaybeSave(
        rendered.scene,
        {
          save: args.save as boolean | undefined,
          name: (args.name as string) ?? rendered.template.name,
          autoPolish: args.autoPolish as boolean | undefined,
        },
        ctx,
      );
      return ok({ templateId: args.templateId, ...result });
    },
  );

  tool(
    "convert_diagram_type",
    "Convert a diagram to another type (e.g. free architecture → C4 container, flow → sequence, repo analysis → system architecture).",
    z.object({
      ...sceneFields,
      structure: z.record(z.string(), z.any()).optional(),
      targetType: z.string().min(1),
      preset: z.string().optional(),
      save: z.boolean().optional(),
      name: z.string().optional(),
      autoPolish: z.boolean().optional(),
    }),
    async (raw, ctx) => {
      const args = raw as Record<string, unknown>;
      const graph = await resolveGraph(args, ctx);
      const scene = convertDiagram(
        graph.nodes,
        graph.edges,
        args.targetType as string,
        args.preset as string | undefined,
      );
      const result = await polishAndMaybeSave(
        scene,
        {
          save: args.save as boolean | undefined,
          name: (args.name as string) ?? `${args.targetType}`,
          autoPolish: args.autoPolish as boolean | undefined,
        },
        ctx,
      );
      return ok({ targetType: args.targetType, ...result });
    },
  );

  return tools;
};

// Shared handler for add_library_items / add_library_items_normalized.
async function addLibraryItemsHandler(
  raw: unknown,
  ctx: ToolContext,
  normalize: boolean,
): Promise<ToolResult> {
  const args = raw as Record<string, unknown>;
  const scene = args.id
    ? (
        await ctx.drawingService.getDrawing(
          ctx.principal.userId,
          args.id as string,
          { includeData: true },
        )
      ).scene ?? toScene([])
    : args.scene || args.elements
      ? coerceScene(args, ctx.config.maxElements)
      : toScene([]);

  const scoreBefore = scoreScene(scene, ctx.config.minDrawingScore).score;

  const result = await ctx.libraryAdapter.addItems({
    scene,
    libraryId: args.libraryId as string,
    itemNames: args.itemNames as string[] | undefined,
    indexes: args.indexes as number[] | undefined,
    position: args.position as { x: number; y: number } | undefined,
    placement: args.placement as never,
    targetCardId: args.targetCardId as string | undefined,
    slotSize: args.slotSize as number | undefined,
    limit: args.limit as number | undefined,
    normalize,
    minFontSize: 16,
  });

  const scoreAfter = scoreScene(result.scene, ctx.config.minDrawingScore).score;

  // Score simulation: in normalized mode, reject items that make it worse.
  const rejected = normalize && scoreAfter < scoreBefore;
  const finalScene = rejected ? scene : result.scene;

  let saved: { drawingId: string; editUrl: string | null } | null = null;
  if (args.save && args.id && !rejected) {
    const summary = await ctx.drawingService.updateDrawing(
      ctx.principal.userId,
      args.id as string,
      { scene: finalScene, createVersion: true },
    );
    const url = await ctx.drawingService.getDrawingUrl(
      ctx.principal.userId,
      summary.id,
    );
    saved = { drawingId: summary.id, editUrl: url.url };
  }

  return ok({
    accepted: !rejected,
    rejectedReason: rejected
      ? `Items lowered the score (${scoreBefore} → ${scoreAfter}); kept the original scene. Try a different item or placement.`
      : undefined,
    addedItems: rejected ? 0 : result.addedItems,
    addedElements: rejected ? 0 : result.addedElements,
    elementCount: finalScene.elements.length,
    normalized: normalize,
    placement: (args.placement as string) ?? "grid",
    librariesUsed: rejected ? [] : result.librariesUsed,
    itemsUsed: rejected ? [] : result.items,
    scoreBefore,
    scoreAfter: rejected ? scoreBefore : scoreAfter,
    scene: finalScene,
    saved,
  });
}
