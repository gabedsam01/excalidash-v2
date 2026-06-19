# MCP Tool Cheatsheet

All **25 tools** are exposed by the ExcaliDash MCP server with the prefix
`mcp__excalidash__`. ExcaliDash works at the **diagram** level (whole scenes,
patterns, quality passes) — there is no element-by-element API. Grouped below
with one line each, followed by the **25 prompts**.

> Always start a session with `read_mcp_guide` to load presets, `MCP_LIBRARY_MODE`,
> limits and the current scoring rubric.

## Core (9)
| Tool | Purpose |
|------|---------|
| `mcp__excalidash__read_mcp_guide` | Return the MCP usage guide: tools, limits, visual standards, presets, quality flow. |
| `mcp__excalidash__create_drawing` | Create an empty drawing, or one from a validated Excalidraw scene/elements. |
| `mcp__excalidash__create_diagram_from_prompt` | Create a complete diagram from a prompt or structured `{nodes,edges}` with a preset + auto-polish. |
| `mcp__excalidash__get_drawing` | Fetch a saved drawing (ownership-scoped); `includeData:true` returns the full scene. |
| `mcp__excalidash__update_drawing` | Apply a safe patch (name/scene/elements); optionally snapshot a version first. |
| `mcp__excalidash__save_drawing` | Save into the workspace; not saved as final when score < minimum unless `asDraft:true`. |
| `mcp__excalidash__save_version` | Create a version snapshot for history/rollback (checkpoint the accepted state). |
| `mcp__excalidash__get_drawing_url` | Return the editable/shareable URL for a drawing (ownership-respecting). |
| `mcp__excalidash__export_drawing` | Export as `excalidraw`/`svg`/`png` (PNG falls back to SVG/URL when headless raster is unavailable). |

## Libraries (5)
| Tool | Purpose |
|------|---------|
| `mcp__excalidash__search_libraries` | Search curated CORE/SPECIALIZED packs or the official PUBLIC catalog (`mode=core/specialized/public/all`). |
| `mcp__excalidash__inspect_library` | List a library's metadata + items (aspect, stroke, fill, complexity); `autoCache:true` caches then inspects. |
| `mcp__excalidash__cache_library` | Download + cache a `.excalidrawlib` on demand (official allowlisted source only, size-limited, hashed). |
| `mcp__excalidash__add_library_items` | Add items from a cached library by `itemNames`/`indexes` at a target position. |
| `mcp__excalidash__add_library_items_normalized` | Add items with normalization (scale, grid snap, min font, colors) so imports match the canvas standard. |

## Quality (4)
| Tool | Purpose |
|------|---------|
| `mcp__excalidash__lint_drawing` | Detect visual/structural/mathematical issues with the geometry engine (arrow-over-text, frame-title overlap, density). |
| `mcp__excalidash__score_drawing` | Score 0-100 with hard blockers, evidence, per-dimension breakdown and an ordered repair plan (default minimum **95**). |
| `mcp__excalidash__repair_drawing` | Automatically fix detected issues (text overflow, small cards, misalignment, unbound arrows, loose items, overlaps). |
| `mcp__excalidash__auto_polish_drawing` | Run lint → score → repair in a loop until the scene scores ≥ minimum or `maxAttempts` is reached. |

## Architecture (4)
| Tool | Purpose |
|------|---------|
| `mcp__excalidash__apply_architecture_skill` | Generate a pattern diagram. `pattern`: `clean`/`hexagonal`/`ddd`/`c4`/`cqrs`/`event-driven`/`microservices`/`modular-monolith`/`mcp`. |
| `mcp__excalidash__validate_architecture` | Validate coherence: frontend→DB, infra→domain, domain→framework, dependency inversion, missing trust boundary, MCP separation. |
| `mcp__excalidash__create_from_repo_analysis` | Build a real architecture diagram from `analysis:{modules,entrypoints,database,services,integrations}`. |
| `mcp__excalidash__suggest_architecture_improvements` | Return prioritized, actionable improvements (by impact and effort). |

## Templates (3)
| Tool | Purpose |
|------|---------|
| `mcp__excalidash__list_templates` | List available templates, visual presets, diagram types, architecture patterns and compatible skills. |
| `mcp__excalidash__create_from_template` | Create a drawing from a built-in template + preset, optionally with `extraNodes`/`extraEdges`. |
| `mcp__excalidash__convert_diagram_type` | Convert a diagram to another type (free architecture → C4 container, flow → sequence, repo analysis → system architecture). |

## Prompts (25)
The 25 MCP prompts are named 1:1 with the 25 installable skills. After
`claude mcp add`, invoke them as slash commands: `/mcp__excalidash__<name>`.

```
/mcp__excalidash__excalidash_diagram_director
/mcp__excalidash__excalidash_design_polisher
/mcp__excalidash__excalidash_visual_lint_repair_loop
/mcp__excalidash__excalidash_library_curator
/mcp__excalidash__excalidash_clean_architecture_reviewer
/mcp__excalidash__excalidash_hexagonal_architecture_mapper
/mcp__excalidash__excalidash_ddd_bounded_contexts
/mcp__excalidash__excalidash_cqrs_diagrammer
/mcp__excalidash__excalidash_event_driven_diagrammer
/mcp__excalidash__excalidash_microservices_topology
/mcp__excalidash__excalidash_modular_monolith
/mcp__excalidash__excalidash_c4_context
/mcp__excalidash__excalidash_c4_container
/mcp__excalidash__excalidash_repo_to_system_design
/mcp__excalidash__excalidash_ai_mcp_architecture
/mcp__excalidash__excalidash_database_dataflow
/mcp__excalidash__excalidash_llm_rag_pipeline
/mcp__excalidash__excalidash_n8n_workflow_diagrammer
/mcp__excalidash__excalidash_observability_flow
/mcp__excalidash__excalidash_troubleshooting_swimlane
/mcp__excalidash__excalidash_security_architecture
/mcp__excalidash__excalidash_auth_api_key_boundaries
/mcp__excalidash__excalidash_devops_cloud_deployment
/mcp__excalidash__excalidash_ui_wireframe_dashboard
/mcp__excalidash__excalidash_portfolio_polished_diagram
```

> Prompts are delivered by the MCP server (no install). The matching **skills**
> are local files installed with `@gabedsam01/excalidash-v2-skills` — each
> skill name maps 1:1 to the prompt above (`excalidash-c4-context` ↔
> `/mcp__excalidash__excalidash_c4_context`).
