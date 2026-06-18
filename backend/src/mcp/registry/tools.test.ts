import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildToolRegistry, type ToolContext } from "./toolRegistry";
import { createDrawingService } from "../drawings/drawingService";
import { createMcpFakePrisma, type McpFakePrisma } from "../__testfixtures__/fakePrisma";
import type { McpConfig } from "../types";

const config: McpConfig = {
  enabled: true,
  endpointPath: "/mcp",
  minDrawingScore: 95,
  maxRepairAttempts: 5,
  allowLowScoreDraft: true,
  maxElements: 5000,
  maxExportMb: 100,
  defaultLibraryMode: "all",
  publicSearchEnabled: false,
  rateLimitWindowSeconds: 900,
  rateLimitMax: 300,
  validateOrigin: true,
};

const tools = buildToolRegistry();
const handler = (name: string) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return async (args: unknown, ctx: ToolContext) =>
    tool.handler(tool.inputSchema.parse(args), ctx);
};
const sc = (res: { structuredContent?: unknown }) =>
  res.structuredContent as Record<string, unknown>;

const identitySanitizer = (d: {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  preview?: string | null;
}) => ({ elements: d.elements as never, appState: d.appState, files: d.files, preview: d.preview ?? null });

const overflowElements = () => [
  { id: "c", type: "rectangle", x: 0, y: 0, width: 80, height: 36, boundElements: [{ id: "t", type: "text" }] },
  { id: "t", type: "text", x: 6, y: 6, width: 220, height: 28, containerId: "c", text: "A long label that clearly overflows", fontSize: 20 },
];

describe("MCP tools (end-to-end via registry)", () => {
  let prisma: McpFakePrisma;
  let libraryAdapter: {
    search: ReturnType<typeof vi.fn>;
    inspect: ReturnType<typeof vi.fn>;
    cache: ReturnType<typeof vi.fn>;
    getDocument: ReturnType<typeof vi.fn>;
    addItems: ReturnType<typeof vi.fn>;
  };

  const ctxFor = (userId: string): ToolContext => ({
    principal: { userId, apiKeyId: "k" },
    config,
    drawingService: createDrawingService({
      prisma,
      frontendBaseUrl: "https://excali.test",
      maxElements: config.maxElements,
      sanitizeScene: identitySanitizer,
    }),
    libraryAdapter: libraryAdapter as never,
  });

  beforeEach(() => {
    prisma = createMcpFakePrisma();
    libraryAdapter = {
      search: vi.fn(async () => ({ mode: "all", results: [], count: 0 })),
      inspect: vi.fn(async () => ({ id: "x", cached: false })),
      cache: vi.fn(async () => ({ id: "x", itemCount: 3 })),
      getDocument: vi.fn(async () => []),
      addItems: vi.fn(async ({ scene }: { scene: unknown }) => ({
        scene,
        addedItems: 0,
        addedElements: 0,
      })),
    };
  });

  it("create_diagram_from_prompt generates a passing diagram and saves it", async () => {
    const res = await handler("create_diagram_from_prompt")(
      { prompt: "Client -> API -> Service -> Database", diagramType: "flow", save: true, name: "Flow" },
      ctxFor("user-1"),
    );
    const data = sc(res);
    expect((data.score as { passed: boolean }).passed).toBe(true);
    expect((data.saved as { drawingId: string }).drawingId).toBeTruthy();
    expect(prisma.__drawings()[0].userId).toBe("user-1");
  });

  it("get_drawing enforces ownership across users", async () => {
    const created = await handler("create_drawing")(
      { name: "Mine", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 }] },
      ctxFor("user-1"),
    );
    const id = (sc(created) as { id: string }).id;
    await expect(
      handler("get_drawing")({ id, includeData: true }, ctxFor("user-2")),
    ).rejects.toMatchObject({ status: 404 });
    const owned = await handler("get_drawing")({ id, includeData: true }, ctxFor("user-1"));
    expect(sc(owned).id).toBe(id);
  });

  it("score_drawing scores provided elements", async () => {
    const res = await handler("score_drawing")(
      { elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 120, height: 60 }] },
      ctxFor("user-1"),
    );
    expect(typeof (sc(res) as { score: number }).score).toBe("number");
  });

  it("auto_polish_drawing repairs a messy scene to a pass", async () => {
    const res = await handler("auto_polish_drawing")(
      { elements: overflowElements(), maxAttempts: 6 },
      ctxFor("user-1"),
    );
    expect((sc(res) as { passed: boolean }).passed).toBe(true);
  });

  it("save_drawing refuses a low-score scene unless drafted", async () => {
    const res = await handler("save_drawing")(
      { name: "bad", elements: overflowElements() },
      ctxFor("user-1"),
    );
    expect((sc(res) as { saved: boolean }).saved).toBe(false);
    expect(prisma.__drawings()).toHaveLength(0);
  });

  it("export_drawing renders SVG and enforces ownership for ids", async () => {
    const svg = await handler("export_drawing")(
      { elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 }], format: "svg" },
      ctxFor("user-1"),
    );
    expect(String((sc(svg) as { content: string }).content)).toContain("<svg");

    const created = await handler("create_drawing")(
      { name: "Mine", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 }] },
      ctxFor("user-1"),
    );
    const id = (sc(created) as { id: string }).id;
    await expect(
      handler("export_drawing")({ id, format: "svg" }, ctxFor("user-2")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("export_drawing PNG returns a structured fallback (never throws)", async () => {
    const res = await handler("export_drawing")(
      { elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60 }], format: "png" },
      ctxFor("user-1"),
    );
    expect((sc(res) as { unsupported?: boolean }).unsupported).toBe(true);
  });

  it("search_libraries delegates to the library adapter", async () => {
    await handler("search_libraries")({ q: "aws", mode: "all" }, ctxFor("user-1"));
    expect(libraryAdapter.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "aws", mode: "all" }),
    );
  });

  it("add_library_items_normalized rejects items that lower the score", async () => {
    libraryAdapter.addItems = vi.fn(async ({ scene }: { scene: { elements: unknown[] } }) => ({
      scene: { ...scene, elements: [...scene.elements, { id: "bad", type: "rectangle", x: 0, y: 0, width: 10, height: 8 }] },
      addedItems: 1, addedElements: 1, items: [{ name: "x", placement: "grid" }], librariesUsed: ["lib"],
    })) as never;
    const res = await handler("add_library_items_normalized")(
      { libraryId: "lib", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 160, height: 60 }] },
      ctxFor("user-1"),
    );
    const data = sc(res) as { accepted: boolean; scoreBefore: number; scoreAfter: number };
    expect(data.accepted).toBe(false);
    expect(data.scoreAfter).toBeLessThanOrEqual(data.scoreBefore);
  });

  it("add_library_items_normalized accepts non-worsening items and reports usage", async () => {
    libraryAdapter.addItems = vi.fn(async ({ scene }: { scene: { elements: unknown[] } }) => ({
      scene: { ...scene, elements: [...scene.elements, { id: "icon", type: "image", x: 8, y: 8, width: 24, height: 24, customData: { excalidash: { library: "logos", item: "AWS" } } }] },
      addedItems: 1, addedElements: 1, items: [{ name: "AWS", placement: "inside-card-left" }], librariesUsed: ["logos"],
    })) as never;
    const res = await handler("add_library_items_normalized")(
      { libraryId: "logos", placement: "inside-card-left", targetCardId: "a", elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 160, height: 60 }] },
      ctxFor("user-1"),
    );
    const data = sc(res) as { accepted: boolean; librariesUsed: string[] };
    expect(data.accepted).toBe(true);
    expect(data.librariesUsed).toContain("logos");
  });

  it("validate_architecture accepts structured input", async () => {
    const res = await handler("validate_architecture")(
      {
        structure: {
          nodes: [
            { id: "web", label: "Web App" },
            { id: "db", label: "PostgreSQL Database" },
          ],
          edges: [{ from: "web", to: "db" }],
        },
      },
      ctxFor("user-1"),
    );
    expect((sc(res) as { valid: boolean }).valid).toBe(false);
  });

  it("list_templates returns 13 templates and 6 presets", async () => {
    const res = await handler("list_templates")({}, ctxFor("user-1"));
    expect((sc(res) as { templates: unknown[] }).templates).toHaveLength(13);
    expect((sc(res) as { presets: unknown[] }).presets).toHaveLength(6);
  });
});
