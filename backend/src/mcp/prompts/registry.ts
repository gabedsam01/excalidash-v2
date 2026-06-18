/**
 * The 25 MCP prompts ("skills via MCP"). Exposed over prompts/list + prompts/get
 * so that after `claude mcp add`, they appear in Claude Code as commands:
 *   /mcp__excalidash__<name>
 *
 * These are NOT tools (the 25 public tools are unchanged). Each prompt renders a
 * structured instruction that drives the external agent through the quality flow
 * (plan → generate → lint → score → repair → validate → save/export) at the
 * minimum score, with library policy and secret redaction baked in.
 */
export interface McpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface McpPromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface McpPrompt {
  name: string;
  title: string;
  description: string;
  arguments: McpPromptArgument[];
  render: (args: Record<string, string>) => McpPromptMessage[];
}

interface PromptSpec {
  name: string;
  title: string;
  blurb: string;
  /** Ordered MCP tool call plan. */
  tools: string[];
  /** Curated libraries to prefer (empty = pure layout). */
  libraries: string[];
  /** Extra, skill-specific guidance lines. */
  guidance: string[];
  /** Diagram-specific acceptance criteria (beyond the shared ones). */
  accept: string[];
  /** Extra named arguments beyond `subject`. */
  extraArgs?: McpPromptArgument[];
}

const SPECS: PromptSpec[] = [
  {
    name: "excalidash_diagram_director",
    title: "Diagram Director",
    blurb:
      "Plan the right diagram type, preset and library policy BEFORE drawing, then drive the full quality flow.",
    tools: [
      "read_mcp_guide",
      "list_templates",
      "create_diagram_from_prompt | create_from_template | apply_architecture_skill",
      "lint_drawing → score_drawing → repair_drawing/auto_polish_drawing",
      "save_drawing → get_drawing_url",
    ],
    libraries: ["Software Architecture", "Flow Chart Symbols", "C4 Architecture"],
    guidance: [
      "Classify the request (flow / c4 / sequence / security / data-flow / wireframe / repo).",
      "Pick one preset and stick to it for visual consistency.",
      "Delegate to the specialized prompt when the request clearly matches one.",
    ],
    accept: ["A diagram type + preset were chosen deliberately and justified."],
  },
  {
    name: "excalidash_design_polisher",
    title: "Design Polisher",
    blurb:
      "Raise an existing drawing to score ≥ 95 by reading the hard blockers and applying the repair plan.",
    tools: [
      "score_drawing (read hardBlockers + mathematicalEvidence + repairPlan)",
      "auto_polish_drawing",
      "score_drawing (confirm ≥ 95)",
      "save_drawing",
    ],
    libraries: [],
    guidance: [
      "Never save below the minimum unless the user explicitly asks for a draft.",
      "If auto_polish lowers the score, it rolls back — investigate the blocker manually.",
    ],
    accept: ["hardBlockers is empty and score ≥ 95 before saving."],
    extraArgs: [
      { name: "drawing_id", description: "Existing drawing id to polish.", required: false },
    ],
  },
  {
    name: "excalidash_visual_lint_repair_loop",
    title: "Visual Lint & Repair Loop",
    blurb:
      "Iteratively lint → score → repair → re-score until the drawing is clean (no arrows over text, no overlaps).",
    tools: [
      "lint_drawing",
      "score_drawing",
      "repair_drawing",
      "score_drawing",
      "export_drawing (svg) / save_version between passes",
    ],
    libraries: [],
    guidance: [
      "Loop until score ≥ 95 or two consecutive passes make no progress.",
      "Snapshot (save_version) before a risky repair; roll back if the score drops.",
    ],
    accept: ["Zero ARROW_TEXT_INTERSECTION and zero FRAME_TITLE_OVERLAP remain."],
  },
  {
    name: "excalidash_library_curator",
    title: "Library Curator",
    blurb:
      "Add professional icons/components from curated (or public) libraries into card icon slots — as seasoning, not clutter.",
    tools: [
      "search_libraries",
      "cache_library",
      "inspect_library",
      "add_library_items_normalized (placement: icon slot)",
      "score_drawing (reject items that lower the score)",
    ],
    libraries: [
      "C4 Architecture",
      "Software Logos",
      "Technology Logos",
      "AWS Architecture Icons",
      "Data Platform",
    ],
    guidance: [
      "Normalize every imported item (scale, aspect ratio, stroke, fill, opacity, grid).",
      "Place icons in reserved slots inside cards — never over text.",
      "Record librariesUsed / itemsUsed / itemsRejected with reasons.",
    ],
    accept: ["files/library items are present and no item reduced the score below 95."],
  },
  {
    name: "excalidash_c4_context",
    title: "C4 Context",
    blurb: "Draw a C4 Level-1 system context: the system, its actors and external systems.",
    tools: [
      "apply_architecture_skill (c4) OR create_diagram_from_prompt",
      "add_library_items_normalized (actors / external logos)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["C4 Architecture", "Stick Figures", "Software Logos"],
    guidance: [
      "One central system; actors and external systems around it; a legend.",
      "Keep it to a single level — push detail to the container view.",
    ],
    accept: ["Exactly one system-in-focus; actors and externals are distinguishable."],
  },
  {
    name: "excalidash_c4_container",
    title: "C4 Container",
    blurb: "Draw a C4 Level-2 container view: apps, APIs and datastores and their interactions.",
    tools: [
      "apply_architecture_skill (c4) OR convert_diagram_type (target c4_container)",
      "add_library_items_normalized (database / cloud symbols)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["C4 Architecture", "Software Architecture", "Data Platform"],
    guidance: [
      "Group containers in frames; route arrows through gutters; legend of container types.",
    ],
    accept: ["Containers grouped in frames; data stores use database symbols."],
  },
  {
    name: "excalidash_clean_architecture_reviewer",
    title: "Clean Architecture Reviewer",
    blurb: "Draw/validate a Clean architecture: dependency direction points inward.",
    tools: [
      "apply_architecture_skill (clean)",
      "validate_architecture",
      "suggest_architecture_improvements",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Architecture diagram components"],
    guidance: ["Frameworks → Adapters → Use Cases → Entities; no outward dependency."],
    accept: ["validate_architecture reports no DEPENDENCY_INVERSION error."],
  },
  {
    name: "excalidash_hexagonal_architecture_mapper",
    title: "Hexagonal Architecture Mapper",
    blurb: "Map ports & adapters: driving adapters, domain core, driven adapters.",
    tools: [
      "apply_architecture_skill (hexagonal)",
      "validate_architecture",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Architecture diagram components"],
    guidance: ["Driving adapters → application/ports → domain → driven adapters."],
    accept: ["Domain core depends on nothing outward (ports only)."],
  },
  {
    name: "excalidash_ddd_bounded_contexts",
    title: "DDD Bounded Contexts",
    blurb: "Draw a context map: bounded contexts, shared kernel and domain events.",
    tools: ["apply_architecture_skill (ddd)", "auto_polish_drawing → save_drawing"],
    libraries: ["Software Architecture"],
    guidance: ["One frame per bounded context; show relationships and the shared kernel."],
    accept: ["Each bounded context is its own framed zone."],
  },
  {
    name: "excalidash_event_driven_diagrammer",
    title: "Event-Driven Diagrammer",
    blurb: "Draw producers → event bus → consumers + event store with async (dashed) edges.",
    tools: ["apply_architecture_skill (event-driven)", "auto_polish_drawing → save_drawing"],
    libraries: ["Software Architecture", "Technology Logos"],
    guidance: ["Use dashed arrows for async; a legend distinguishing sync vs async."],
    accept: ["Async edges are dashed and explained in the legend."],
  },
  {
    name: "excalidash_cqrs_diagrammer",
    title: "CQRS Diagrammer",
    blurb: "Separate the write path (command → write model → bus) from the read path (projection → read model → query).",
    tools: ["apply_architecture_skill (cqrs)", "auto_polish_drawing → save_drawing"],
    libraries: ["Software Architecture"],
    guidance: ["Two clearly separated lanes; the bus links write to read."],
    accept: ["Write and read paths are visually separated."],
  },
  {
    name: "excalidash_microservices_topology",
    title: "Microservices Topology",
    blurb: "Gateway, services with their own datastores, and async queues/event bus.",
    tools: [
      "apply_architecture_skill (microservices)",
      "add_library_items_normalized (cloud/tech logos)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Cloud/DevOps", "Technology Logos"],
    guidance: ["Gateway on top; each service owns its DB; queues for async."],
    accept: ["Each service has its own data store; no shared DB unless intended."],
  },
  {
    name: "excalidash_modular_monolith",
    title: "Modular Monolith",
    blurb: "Modules inside one deployable shell, over a shared database.",
    tools: ["apply_architecture_skill (modular-monolith)", "auto_polish_drawing → save_drawing"],
    libraries: ["Software Architecture"],
    guidance: ["An application-shell frame containing module cards; one shared DB."],
    accept: ["Modules are inside the shell frame; a single shared database."],
  },
  {
    name: "excalidash_repo_to_system_design",
    title: "Repo to System Design",
    blurb: "Turn a structured repository analysis into a framed, routed system-design diagram with a legend.",
    tools: [
      "create_from_repo_analysis (rich model)",
      "lint_drawing → score_drawing",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Technology Logos", "Cloud/DevOps", "Data Platform"],
    guidance: [
      "Pass the rich model: actors, apps, gateways, services, workers, queues, databases, integrations, auth/security, observability, risks, flows.",
      "REDACT secrets before sending the analysis — never include JWTs, keys, db URLs or tokens.",
    ],
    accept: ["Zones are framed; a legend is present; create_from_repo_analysis did NOT stub."],
    extraArgs: [
      {
        name: "analysis",
        description: "JSON repository analysis (actors/apps/services/...). Secrets must be pre-redacted.",
        required: false,
      },
    ],
  },
  {
    name: "excalidash_n8n_workflow_diagrammer",
    title: "n8n Workflow Diagrammer",
    blurb: "Lay out an n8n / automation workflow as a readable left-to-right node graph.",
    tools: [
      "create_diagram_from_prompt (direction LR)",
      "add_library_items_normalized (integration logos)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Flow Chart Symbols", "Technology Logos"],
    guidance: ["Trigger → nodes → outputs; branches as diamonds; logos in node slots."],
    accept: ["Flow reads left-to-right with no crossing connectors."],
  },
  {
    name: "excalidash_database_dataflow",
    title: "Database & Data Flow",
    blurb: "Draw tables/entities and data flow with database symbols.",
    tools: [
      "create_diagram_from_prompt (database/dataflow)",
      "add_library_items_normalized (database symbols)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Data Platform", "Software Logos", "Data Flow"],
    guidance: ["Tables as cards; relations as arrows; data stores as database symbols; legend."],
    accept: ["Relationships are labelled and data stores use database symbols."],
  },
  {
    name: "excalidash_security_architecture",
    title: "Security Architecture",
    blurb: "Show trust boundaries, auth and data protection — with every secret redacted.",
    tools: [
      "create_diagram_from_prompt (security) OR apply_architecture_skill",
      "validate_architecture (trust boundary present?)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Cloud Design Patterns", "AWS Architecture Icons"],
    guidance: [
      "Trust-boundary frames around protected zones; an explicit auth gateway.",
      "NEVER render a real secret — use [REDACTED_*] placeholders only.",
    ],
    accept: ["A trust boundary exists; no raw secret appears anywhere."],
  },
  {
    name: "excalidash_auth_api_key_boundaries",
    title: "Auth & API-Key Boundaries",
    blurb: "Diagram authentication and API-key/bearer trust boundaries.",
    tools: [
      "create_diagram_from_prompt (security/auth)",
      "validate_architecture",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Cloud Design Patterns", "Software Architecture"],
    guidance: ["Client → auth/bearer boundary → protected services; keys shown as [REDACTED_API_KEY]."],
    accept: ["The bearer/API-key boundary is explicit; no real key is shown."],
  },
  {
    name: "excalidash_observability_flow",
    title: "Observability Flow",
    blurb: "Draw logs/metrics/traces pipelines: services → collectors → storage → dashboards/alerts.",
    tools: [
      "create_diagram_from_prompt (observability)",
      "add_library_items_normalized (tech logos)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Cloud/DevOps", "Technology Logos"],
    guidance: ["Dashed telemetry arrows; a legend for signal types (logs/metrics/traces)."],
    accept: ["Telemetry edges are dashed; signal types are in the legend."],
  },
  {
    name: "excalidash_devops_cloud_deployment",
    title: "DevOps & Cloud Deployment",
    blurb: "Draw CI/CD pipelines and cloud deployment topology.",
    tools: [
      "create_diagram_from_prompt (deployment, LR)",
      "add_library_items_normalized (cloud provider logos)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Cloud/DevOps", "AWS Architecture Icons", "Technology Logos"],
    guidance: ["Pipeline stages LR; cloud target frames (VPC/regions); provider logos in slots."],
    accept: ["Pipeline stages are ordered; cloud targets are framed."],
  },
  {
    name: "excalidash_ai_mcp_architecture",
    title: "AI & MCP Architecture",
    blurb: "Model an MCP server / AI tool architecture with separated transport, auth, registry and storage.",
    tools: [
      "apply_architecture_skill (mcp)",
      "validate_architecture (MCP separation)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Technology Logos"],
    guidance: ["Client on the edge; distinct transport, auth (bearer), tool registry, services, storage."],
    accept: ["Transport, auth and storage are separate nodes."],
  },
  {
    name: "excalidash_llm_rag_pipeline",
    title: "LLM & RAG Pipeline",
    blurb: "Draw an LLM/RAG pipeline: ingest → embed → vector store → retrieve → LLM → response.",
    tools: [
      "create_diagram_from_prompt (pipeline)",
      "add_library_items_normalized (tech logos / data platform)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Software Architecture", "Data Platform", "Technology Logos"],
    guidance: ["Distinguish the index path from the query path; dashed for async indexing."],
    accept: ["Index and query paths are both visible and distinguishable."],
  },
  {
    name: "excalidash_ui_wireframe_dashboard",
    title: "UI Wireframe / Dashboard",
    blurb: "Build a low-fidelity UI wireframe / dashboard with consistent spacing.",
    tools: [
      "create_from_template (wireframe) OR create_diagram_from_prompt",
      "add_library_items_normalized (UI kit)",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Lo-Fi Wireframing Kit", "Web Kit", "Mobile Kit"],
    guidance: ["A grid of panels with consistent spacing; UI-kit items in slots; no overlapping labels."],
    accept: ["Panels align on a grid; no labels overlap."],
  },
  {
    name: "excalidash_portfolio_polished_diagram",
    title: "Portfolio Polished Diagram",
    blurb: "Produce a presentation/portfolio-grade architecture visual.",
    tools: [
      "create_diagram_from_prompt (preset portfolio-polished)",
      "add_library_items_normalized (logos)",
      "auto_polish_drawing → export_drawing (png/svg)",
    ],
    libraries: ["Technology Logos", "Software Logos"],
    guidance: ["Generous spacing, logos in slots, a strong legend; export PNG/SVG."],
    accept: ["Score ≥ 95 with the portfolio preset; export succeeds."],
  },
  {
    name: "excalidash_troubleshooting_swimlane",
    title: "Troubleshooting Swimlane",
    blurb: "Draw an incident/troubleshooting swimlane with lanes, decisions and terminal states.",
    tools: [
      "convert_diagram_type (target swimlane, LR) OR create_diagram_from_prompt",
      "auto_polish_drawing → save_drawing",
    ],
    libraries: ["Flow Chart Symbols", "Data Flow"],
    guidance: ["One lane per actor/system; decisions as diamonds; clear terminal states; legend."],
    accept: ["Lanes are distinct; decision branches are labelled."],
  },
];

const SHARED_ACCEPTANCE = [
  "score_drawing ≥ 95 and hardBlockers is empty before saving as final.",
  "No arrow crosses readable text (ARROW_TEXT_INTERSECTION = 0).",
  "No content overlaps a frame title; headers are not encavalados.",
  "The whole diagram fits the viewport with margin.",
  "No raw secret (JWT, API key, service-role, db URL, token, bearer, webhook, proxy) appears anywhere.",
];

const renderPrompt = (spec: PromptSpec) => (
  args: Record<string, string>,
): McpPromptMessage[] => {
  const subject = (args.subject ?? "").trim();
  const analysis = (args.analysis ?? "").trim();
  const lines: string[] = [];
  lines.push(`# ExcaliDash skill — ${spec.title}`);
  lines.push("");
  lines.push(spec.blurb);
  if (subject) {
    lines.push("");
    lines.push(`## Subject`);
    lines.push(subject);
  }
  if (analysis) {
    lines.push("");
    lines.push(`## Repository analysis (use as-is; redact any remaining secrets)`);
    lines.push("```json");
    lines.push(analysis.slice(0, 8000));
    lines.push("```");
  }
  lines.push("");
  lines.push("## Recommended MCP tool sequence");
  spec.tools.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  lines.push("");
  lines.push("## Library policy");
  lines.push(
    spec.libraries.length > 0
      ? `Prefer curated libraries: ${spec.libraries.join(", ")}. Add items only via add_library_items_normalized into reserved icon slots; reject any item that lowers the score. When MCP_LIBRARY_MODE is required, library/icon items are mandatory.`
      : "This skill is pure layout — libraries are optional. Add icons only if they improve clarity.",
  );
  if (spec.guidance.length > 0) {
    lines.push("");
    lines.push("## Guidance");
    spec.guidance.forEach((g) => lines.push(`- ${g}`));
  }
  lines.push("");
  lines.push("## Validation (mandatory)");
  lines.push(
    "Run lint_drawing → score_drawing; if score < 95 or hardBlockers is non-empty, run repair_drawing/auto_polish_drawing and re-score. Repair is mandatory before saving as final.",
  );
  lines.push("");
  lines.push("## Acceptance criteria");
  [...spec.accept, ...SHARED_ACCEPTANCE].forEach((a) => lines.push(`- ${a}`));
  lines.push("");
  lines.push("## Secrets");
  lines.push(
    "Never emit raw secrets. The MCP also redacts on output, but you must not paste real JWTs/keys/tokens/db URLs into labels — use [REDACTED_*] placeholders.",
  );
  return [{ role: "user", content: { type: "text", text: lines.join("\n") } }];
};

export const buildPromptRegistry = (): McpPrompt[] =>
  SPECS.map((spec) => ({
    name: spec.name,
    title: spec.title,
    description: spec.blurb,
    arguments: [
      {
        name: "subject",
        description:
          "What to diagram (the system, repo, prompt or requirements). Optional.",
        required: false,
      },
      ...(spec.extraArgs ?? []),
    ],
    render: renderPrompt(spec),
  }));

export const PROMPT_NAMES = SPECS.map((s) => s.name);
