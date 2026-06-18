import { describe, expect, it } from "vitest";
import { buildPromptRegistry, PROMPT_NAMES } from "./registry";

const EXPECTED = [
  "excalidash_diagram_director",
  "excalidash_design_polisher",
  "excalidash_visual_lint_repair_loop",
  "excalidash_library_curator",
  "excalidash_c4_context",
  "excalidash_c4_container",
  "excalidash_clean_architecture_reviewer",
  "excalidash_hexagonal_architecture_mapper",
  "excalidash_ddd_bounded_contexts",
  "excalidash_event_driven_diagrammer",
  "excalidash_cqrs_diagrammer",
  "excalidash_microservices_topology",
  "excalidash_modular_monolith",
  "excalidash_repo_to_system_design",
  "excalidash_n8n_workflow_diagrammer",
  "excalidash_database_dataflow",
  "excalidash_security_architecture",
  "excalidash_auth_api_key_boundaries",
  "excalidash_observability_flow",
  "excalidash_devops_cloud_deployment",
  "excalidash_ai_mcp_architecture",
  "excalidash_llm_rag_pipeline",
  "excalidash_ui_wireframe_dashboard",
  "excalidash_portfolio_polished_diagram",
  "excalidash_troubleshooting_swimlane",
];

describe("MCP prompt registry", () => {
  const prompts = buildPromptRegistry();

  it("exposes exactly 25 prompts with the required names", () => {
    expect(prompts).toHaveLength(25);
    expect(PROMPT_NAMES).toHaveLength(25);
    expect([...PROMPT_NAMES].sort()).toEqual([...EXPECTED].sort());
  });

  it("every prompt renders a user message with the quality contract", () => {
    for (const p of prompts) {
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.arguments.some((a) => a.name === "subject")).toBe(true);
      const messages = p.render({ subject: "my system" });
      expect(messages).toHaveLength(1);
      const text = messages[0].content.text;
      expect(text).toContain("my system");
      expect(text).toContain("Acceptance criteria");
      expect(text).toMatch(/score/i);
      expect(text).toMatch(/secret/i);
    }
  });

  it("the repo prompt accepts an analysis argument and embeds it", () => {
    const repo = prompts.find((p) => p.name === "excalidash_repo_to_system_design")!;
    expect(repo.arguments.some((a) => a.name === "analysis")).toBe(true);
    const text = repo.render({ analysis: '{"name":"Acme"}' })[0].content.text;
    expect(text).toContain("Acme");
  });
});
