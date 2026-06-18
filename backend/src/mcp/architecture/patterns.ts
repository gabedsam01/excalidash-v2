/**
 * apply_architecture_skill, suggest_architecture_improvements,
 * create_from_repo_analysis and convert_diagram_type logic.
 */
import type { ExcalidrawScene } from "../types";
import {
  layoutGraph,
  type GraphEdge,
  type GraphNode,
} from "../layout/graphLayout";
import {
  layoutBands,
  type Band,
  type BandCard,
  type BandEdge,
} from "../layout/bandLayout";
import { getPreset } from "../templates/presets";
import { redactString } from "../security/redaction";
import { validateArchitecture } from "./validator";

const n = (id: string, label: string, group?: string): GraphNode => ({
  id,
  label,
  group,
});
const e = (from: string, to: string, label?: string): GraphEdge => ({
  from,
  to,
  label,
});

interface PatternDef {
  title: string;
  direction: "TB" | "LR";
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const ARCHITECTURE_PATTERNS: Record<string, PatternDef> = {
  clean: {
    title: "Clean Architecture",
    direction: "TB",
    nodes: [
      n("frameworks", "Frameworks & Drivers", "outer"),
      n("adapters", "Interface Adapters", "mid"),
      n("usecases", "Use Cases", "inner"),
      n("entities", "Entities", "core"),
    ],
    edges: [e("frameworks", "adapters"), e("adapters", "usecases"), e("usecases", "entities")],
  },
  hexagonal: {
    title: "Hexagonal Architecture",
    direction: "TB",
    nodes: [
      n("ui", "UI Adapter", "driving"),
      n("api", "HTTP Adapter", "driving"),
      n("app", "Application Service", "port"),
      n("domain", "Domain Core", "core"),
      n("db", "DB Adapter", "driven"),
      n("ext", "External Adapter", "driven"),
    ],
    edges: [e("ui", "app"), e("api", "app"), e("app", "domain"), e("domain", "db"), e("domain", "ext")],
  },
  ddd: {
    title: "Domain-Driven Design",
    direction: "TB",
    nodes: [
      n("ctxA", "Ordering Context", "context"),
      n("ctxB", "Billing Context", "context"),
      n("shared", "Shared Kernel", "shared"),
      n("events", "Domain Events", "events"),
    ],
    edges: [e("ctxA", "shared"), e("ctxB", "shared"), e("ctxA", "events"), e("events", "ctxB")],
  },
  c4: {
    title: "C4 Container",
    direction: "TB",
    nodes: [
      n("web", "Web App", "app"),
      n("api", "API", "app"),
      n("db", "Database", "data"),
      n("ext", "External System", "external"),
    ],
    edges: [e("web", "api"), e("api", "db"), e("api", "ext")],
  },
  cqrs: {
    title: "CQRS",
    direction: "TB",
    nodes: [
      n("client", "Client", "client"),
      n("command", "Command Handler", "write"),
      n("write", "Write Model", "write"),
      n("bus", "Event Bus", "events"),
      n("projection", "Projection", "read"),
      n("read", "Read Model", "read"),
      n("query", "Query Handler", "read"),
    ],
    edges: [
      e("client", "command"),
      e("command", "write"),
      e("write", "bus"),
      e("bus", "projection"),
      e("projection", "read"),
      e("client", "query"),
      e("query", "read"),
    ],
  },
  "event-driven": {
    title: "Event-Driven Architecture",
    direction: "TB",
    nodes: [
      n("producer", "Producer", "app"),
      n("bus", "Event Bus", "events"),
      n("consumerA", "Consumer A", "app"),
      n("consumerB", "Consumer B", "app"),
      n("store", "Event Store", "data"),
    ],
    edges: [
      e("producer", "bus"),
      e("bus", "consumerA"),
      e("bus", "consumerB"),
      e("bus", "store"),
    ],
  },
  microservices: {
    title: "Microservices",
    direction: "TB",
    nodes: [
      n("gateway", "API Gateway", "edge"),
      n("svcA", "Orders Service", "service"),
      n("svcB", "Payments Service", "service"),
      n("svcC", "Users Service", "service"),
      n("dbA", "Orders DB", "data"),
      n("dbB", "Payments DB", "data"),
      n("dbC", "Users DB", "data"),
    ],
    edges: [
      e("gateway", "svcA"),
      e("gateway", "svcB"),
      e("gateway", "svcC"),
      e("svcA", "dbA"),
      e("svcB", "dbB"),
      e("svcC", "dbC"),
    ],
  },
  "modular-monolith": {
    title: "Modular Monolith",
    direction: "TB",
    nodes: [
      n("app", "Application Shell", "app"),
      n("modA", "Orders Module", "module"),
      n("modB", "Billing Module", "module"),
      n("modC", "Identity Module", "module"),
      n("db", "Shared Database", "data"),
    ],
    edges: [
      e("app", "modA"),
      e("app", "modB"),
      e("app", "modC"),
      e("modA", "db"),
      e("modB", "db"),
      e("modC", "db"),
    ],
  },
  mcp: {
    title: "MCP Architecture",
    direction: "TB",
    nodes: [
      n("client", "MCP Client", "client"),
      n("transport", "/mcp Transport", "edge"),
      n("auth", "Auth (Bearer)", "edge"),
      n("registry", "Tool Registry", "core"),
      n("services", "Tool Services", "service"),
      n("db", "PostgreSQL", "data"),
    ],
    edges: [
      e("client", "transport"),
      e("transport", "auth"),
      e("auth", "registry"),
      e("registry", "services"),
      e("services", "db"),
    ],
  },
};

export const ARCHITECTURE_PATTERN_IDS = Object.keys(ARCHITECTURE_PATTERNS);

export const applyArchitectureSkill = (
  pattern: string,
  presetId?: string,
  title?: string,
): { scene: ExcalidrawScene; pattern: string } | null => {
  const def = ARCHITECTURE_PATTERNS[pattern];
  if (!def) return null;
  const preset = getPreset(presetId);
  const scene = layoutGraph(def.nodes, def.edges, {
    preset,
    title: title ?? def.title,
    direction: def.direction,
  });
  return { scene, pattern };
};

export interface Suggestion {
  title: string;
  rationale: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  action: string;
}

const IMPACT_RANK = { high: 3, medium: 2, low: 1 } as const;
const EFFORT_RANK = { low: 1, medium: 2, high: 3 } as const;

export const suggestImprovements = (
  nodes: GraphNode[],
  edges: GraphEdge[],
): { suggestions: Suggestion[]; validation: ReturnType<typeof validateArchitecture> } => {
  const validation = validateArchitecture(nodes, edges);
  const suggestions: Suggestion[] = [];

  for (const issue of validation.issues) {
    if (issue.code === "FRONTEND_TO_DB") {
      suggestions.push({
        title: "Insert an API/service layer between UI and database",
        rationale: issue.message,
        impact: "high",
        effort: "medium",
        action: "Route presentation access through a controller + service rather than the data store.",
      });
    } else if (issue.code === "AUTH_NO_BOUNDARY") {
      suggestions.push({
        title: "Add an explicit trust boundary (auth / API key)",
        rationale: issue.message,
        impact: "high",
        effort: "low",
        action: "Introduce an auth/API-key node and a boundary frame around trusted services.",
      });
    } else if (issue.code === "DEPENDENCY_INVERSION" || issue.code === "DOMAIN_DEPENDS_FRAMEWORK") {
      suggestions.push({
        title: "Invert outward dependencies (DIP)",
        rationale: issue.message,
        impact: "medium",
        effort: "medium",
        action: "Depend on abstractions (ports); keep the domain free of framework/infrastructure references.",
      });
    } else if (issue.code === "INFRA_INTO_DOMAIN") {
      suggestions.push({
        title: "Stop infrastructure from reaching into the domain",
        rationale: issue.message,
        impact: "high",
        effort: "medium",
        action: "Expose domain operations via ports; let infrastructure implement them, not call inward.",
      });
    } else if (issue.code === "MCP_NO_SEPARATION") {
      suggestions.push({
        title: "Separate MCP transport, auth and storage",
        rationale: issue.message,
        impact: "medium",
        effort: "low",
        action: "Model distinct transport, auth and storage nodes with clear boundaries.",
      });
    }
  }

  if (nodes.length > 8) {
    suggestions.push({
      title: "Adopt C4 levels to manage complexity",
      rationale: `The diagram has ${nodes.length} components; a single level is hard to read.`,
      impact: "medium",
      effort: "medium",
      action: "Split into C4 Context + Container levels (use convert_diagram_type → c4_container).",
    });
  }
  if (edges.length >= 4 && nodes.every((node) => /service|api|worker/i.test(node.label) === false) === false) {
    suggestions.push({
      title: "Consider an async boundary (queue/event bus)",
      rationale: "Long synchronous chains couple services and reduce resilience.",
      impact: "medium",
      effort: "medium",
      action: "Introduce a queue/event bus between services that can run asynchronously.",
    });
  }

  // Dedupe by title and sort by impact desc then effort asc.
  const seen = new Set<string>();
  const unique = suggestions.filter((s) =>
    seen.has(s.title) ? false : (seen.add(s.title), true),
  );
  unique.sort(
    (a, b) =>
      IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] ||
      EFFORT_RANK[a.effort] - EFFORT_RANK[b.effort],
  );
  return { suggestions: unique, validation };
};

/** A permissive entry: a bare label or an object with a name/label/kind. */
type RepoEntry = string | { name?: string; label?: string; kind?: string };

/**
 * Rich repository-analysis model. Every field is optional and permissive so a
 * large external scan never crashes the tool — unknown shapes are tolerated and
 * synonyms are merged. Secrets in any label are redacted before drawing.
 */
export interface RepoAnalysis {
  name?: string;
  actors?: RepoEntry[];
  users?: RepoEntry[];
  apps?: RepoEntry[];
  frontends?: RepoEntry[];
  frontend?: RepoEntry[];
  gateways?: RepoEntry[];
  gateway?: RepoEntry[];
  entrypoints?: RepoEntry[];
  services?: RepoEntry[];
  modules?: RepoEntry[];
  workers?: RepoEntry[];
  queues?: RepoEntry[];
  databases?: RepoEntry[];
  database?: RepoEntry[];
  integrations?: RepoEntry[];
  external?: RepoEntry[];
  externalIntegrations?: RepoEntry[];
  auth?: RepoEntry[];
  security?: RepoEntry[];
  boundaries?: RepoEntry[];
  observability?: RepoEntry[];
  risks?: RepoEntry[];
  flows?: Array<{ from?: string; to?: string; label?: string; async?: boolean }>;
  [key: string]: unknown;
}

const asArray = (v: unknown): RepoEntry[] =>
  Array.isArray(v) ? (v as RepoEntry[]) : v == null ? [] : [v as RepoEntry];

const entryLabel = (e: RepoEntry): string => {
  const raw =
    typeof e === "string"
      ? e
      : String(e?.name ?? e?.label ?? "Item");
  return redactString(raw).slice(0, 48).trim() || "Item";
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";

interface ZoneSpec {
  id: string;
  title: string;
  sources: Array<keyof RepoAnalysis>;
}

const ZONE_SPECS: ZoneSpec[] = [
  { id: "actors", title: "Actors & Users", sources: ["actors", "users"] },
  {
    id: "apps",
    title: "Client Apps & Frontends",
    sources: ["apps", "frontends", "frontend"],
  },
  {
    id: "edge",
    title: "Edge, Gateway & Auth",
    sources: ["gateways", "gateway", "auth", "security", "boundaries", "entrypoints"],
  },
  {
    id: "services",
    title: "Services & API",
    sources: ["services", "modules"],
  },
  { id: "data", title: "Data Stores", sources: ["databases", "database"] },
  { id: "async", title: "Async, Queues & Workers", sources: ["queues", "workers"] },
  {
    id: "external",
    title: "External Integrations",
    sources: ["integrations", "external", "externalIntegrations"],
  },
  { id: "observability", title: "Observability", sources: ["observability"] },
];

export const buildFromRepoAnalysis = (
  analysis: RepoAnalysis,
  presetId?: string,
): ExcalidrawScene => {
  const preset = getPreset(presetId);
  const usedIds = new Set<string>();
  const mkId = (zoneId: string, label: string): string => {
    let id = `${zoneId}_${slugify(label)}`;
    let n = 1;
    while (usedIds.has(id)) id = `${zoneId}_${slugify(label)}_${n++}`;
    usedIds.add(id);
    return id;
  };

  const MAX_PER_ZONE = 8;
  const bands: Band[] = ZONE_SPECS.map((spec) => {
    const labels: string[] = [];
    for (const src of spec.sources) {
      for (const e of asArray(analysis[src])) {
        const label = entryLabel(e);
        if (label && !labels.includes(label)) labels.push(label);
      }
    }
    const truncated = labels.slice(0, MAX_PER_ZONE);
    return {
      id: spec.id,
      title: spec.title,
      cards: truncated.map((label) => ({ id: mkId(spec.id, label), label })),
    };
  });

  const cardsOf = (zoneId: string): BandCard[] =>
    bands.find((b) => b.id === zoneId)?.cards ?? [];
  const lead = (zoneId: string): BandCard | undefined => cardsOf(zoneId)[0];
  const edges: BandEdge[] = [];
  const connectEach = (from: BandCard[], to?: BandCard, style?: "dashed") => {
    if (!to) return;
    for (const f of from) edges.push({ from: f.id, to: to.id, style });
  };
  const fanOut = (from: BandCard | undefined, to: BandCard[], style?: "dashed") => {
    if (!from) return;
    for (const t of to) edges.push({ from: from.id, to: t.id, style });
  };

  // Canonical request pipeline (kept sparse so the diagram stays readable).
  connectEach(cardsOf("actors"), lead("apps") ?? lead("edge") ?? lead("services"));
  connectEach(cardsOf("apps"), lead("edge") ?? lead("services"));
  fanOut(lead("edge"), cardsOf("services"));
  connectEach(cardsOf("services"), lead("data"));
  edges.push(
    ...maybeEdge(lead("services"), lead("async"), "dashed"),
    ...maybeEdge(lead("async"), lead("data"), "dashed"),
    ...maybeEdge(lead("services"), lead("external"), "dashed"),
    ...maybeEdge(lead("services"), lead("observability"), "dashed"),
    ...maybeEdge(lead("data"), lead("observability"), "dashed"),
  );

  // Explicit flows from the analysis, matched to cards by label slug.
  const bySlug = new Map<string, BandCard>();
  for (const band of bands)
    for (const c of band.cards) bySlug.set(slugify(c.label), c);
  for (const flow of analysis.flows ?? []) {
    const from = flow.from ? bySlug.get(slugify(redactString(flow.from))) : undefined;
    const to = flow.to ? bySlug.get(slugify(redactString(flow.to))) : undefined;
    if (from && to && from.id !== to.id) {
      edges.push({
        from: from.id,
        to: to.id,
        label: flow.label ? redactString(flow.label).slice(0, 32) : undefined,
        style: flow.async ? "dashed" : "solid",
      });
    }
  }

  // Fallback: never produce an empty scene.
  if (bands.every((b) => b.cards.length === 0)) {
    bands[3].cards.push({ id: "system", label: redactString(analysis.name ?? "System") });
  }

  const legend: Array<{ label: string; color?: string }> = bands
    .filter((b) => b.cards.length > 0)
    .map((b, i) => ({ label: b.title, color: preset.palette[i % preset.palette.length] }));
  legend.push({ label: "Dashed = async / external / telemetry" });

  const notes = asArray(analysis.risks).map(entryLabel).slice(0, 6);

  return layoutBands(bands, edges, {
    preset,
    title: analysis.name
      ? `${redactString(analysis.name).slice(0, 60)} — Architecture`
      : "Repository Architecture",
    legend,
    notes,
  });
};

const maybeEdge = (
  from: BandCard | undefined,
  to: BandCard | undefined,
  style?: "dashed",
): BandEdge[] =>
  from && to && from.id !== to.id
    ? [{ from: from.id, to: to.id, style }]
    : [];

export const convertDiagram = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  targetType: string,
  presetId?: string,
): ExcalidrawScene => {
  const preset = getPreset(presetId);
  const direction: "TB" | "LR" = /sequence|swimlane|timeline|deployment/i.test(
    targetType,
  )
    ? "LR"
    : "TB";
  const title = targetType
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return layoutGraph(nodes, edges, { preset, title, direction });
};
