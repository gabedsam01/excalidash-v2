# ExcaliDash MCP

The ExcaliDash MCP server lives at `/mcp`. It lets an external agent (Claude
Code or any MCP client) generate, validate, repair, version, export and save
professional Excalidraw diagrams in the authenticated user's workspace. **No LLM
runs inside ExcaliDash** — the MCP only executes deterministic tools.

## Tools vs. prompts vs. skills

| Surface | Count | How it ships | How you get it |
| --- | --- | --- | --- |
| **Tools** | 25 | `tools/list` over `/mcp` | Automatic once connected |
| **MCP prompts** | 25 | `prompts/list` over `/mcp` | Automatic once connected (`/mcp__excalidash__*`) |
| **Claude Code skills** | 25 | files in `skills/excalidash/` | **Installed/copied locally** (see [skills.md](skills.md)) |

- **Tools** do the work (create/lint/score/repair/save/export, libraries,
  architecture, templates).
- **MCP prompts** are guided instructions exposed by the server. After
  `claude mcp add`, they appear in Claude Code as commands like
  `/mcp__excalidash__diagram_director`. They need **no install**.
- **Claude Code skills** are local skill files. `claude mcp add` does **not**
  copy them — install them with the bundled CLI.

## Install the MCP

Create a Bearer `exd_` API key in Settings → MCP / API Keys, then:

```bash
# scope: local | project | user
claude mcp add --transport http excalidash --scope local https://your-domain/mcp \
  --header "Authorization: Bearer exd_YOUR_TOKEN"
claude mcp add --transport http excalidash --scope project https://your-domain/mcp \
  --header "Authorization: Bearer exd_YOUR_TOKEN"
claude mcp add --transport http excalidash --scope user https://your-domain/mcp \
  --header "Authorization: Bearer exd_YOUR_TOKEN"
```

- **local** — only this project, private in `~/.claude.json`.
- **project** — writes `.mcp.json` in the repo for team sharing (don't commit
  real tokens).
- **user** — available in all your projects.

Other MCP clients:

```json
{
  "mcpServers": {
    "excalidash": {
      "type": "http",
      "url": "https://your-domain/mcp",
      "headers": { "Authorization": "Bearer exd_YOUR_TOKEN" },
      "alwaysLoad": true
    }
  }
}
```

`type` may be `"http"` or `"streamable-http"` depending on the client.
`alwaysLoad` is optional (eager tool/prompt loading at startup).

## The 25 tools

| Group | Tools |
| --- | --- |
| Core (9) | `read_mcp_guide`, `create_drawing`, `create_diagram_from_prompt`, `update_drawing`, `get_drawing`, `save_drawing`, `save_version`, `get_drawing_url`, `export_drawing` |
| Libraries (5) | `search_libraries`, `inspect_library`, `cache_library`, `add_library_items`, `add_library_items_normalized` |
| Quality (4) | `lint_drawing`, `score_drawing`, `repair_drawing`, `auto_polish_drawing` |
| Architecture (4) | `create_from_repo_analysis`, `apply_architecture_skill`, `validate_architecture`, `suggest_architecture_improvements` |
| Templates (3) | `list_templates`, `create_from_template`, `convert_diagram_type` |

Always call `read_mcp_guide` first.

## The 25 prompts

`prompts/list` returns 25 prompts; each appears as `/mcp__excalidash__<name>`:

```
diagram_director, design_polisher, visual_lint_repair_loop, library_curator,
c4_context, c4_container, clean_architecture_reviewer,
hexagonal_architecture_mapper, ddd_bounded_contexts, event_driven_diagrammer,
cqrs_diagrammer, microservices_topology, modular_monolith,
repo_to_system_design, n8n_workflow_diagrammer, database_dataflow,
security_architecture, auth_api_key_boundaries, observability_flow,
devops_cloud_deployment, ai_mcp_architecture, llm_rag_pipeline,
ui_wireframe_dashboard, portfolio_polished_diagram, troubleshooting_swimlane
```

Each prompt accepts an optional `subject` argument (and `repo_to_system_design`
accepts an `analysis` JSON argument).

## Quality flow (geometry-validated, honest scoring)

```
generate → lint_drawing → score_drawing → repair_drawing / auto_polish_drawing → score → save_drawing → export_drawing
```

- **Hard blockers** cap the score below the passing bar regardless of how few
  other issues exist: `ARROW_TEXT_INTERSECTION` (an arrow over readable text,
  measured by segment/rectangle clipping — not bounding boxes), `FRAME_TITLE_OVERLAP`,
  `DUPLICATE_SHAPES`, `TEXT_OVERFLOW`, `ITEM_OUTSIDE_FRAME`, `EMPTY_SCENE`, and
  `NO_LIBRARY_USAGE` (in `required` mode).
- `score_drawing` returns `score`, `passed`, `hardBlockers`, `issues`,
  `mathematicalEvidence`, `breakdown` and an ordered `repairPlan`.
- `repair_drawing` reroutes arrows around text, moves edge labels off arrow
  paths, grows frames/cards, snaps to grid and re-binds arrows.
- `auto_polish_drawing` loops to `MCP_MAX_REPAIR_ATTEMPTS` and **rolls back** any
  pass that lowers the score.
- The passing bar is `MCP_MIN_DRAWING_SCORE` (default 95). `save_drawing` refuses
  below it unless `asDraft` and `MCP_ALLOW_LOW_SCORE_DRAFT`.

## Libraries

`MCP_LIBRARY_MODE` controls enforcement: `off` | `curated` | `required`. In
`required`, a rich diagram with no library/icon items is a hard blocker. Use
`search_libraries → cache_library → inspect_library → add_library_items_normalized`.
Normalized placement supports icon slots: `inside-card-left`, `inside-card-top`,
`badge`, `legend`, `actor`, `database-symbol`, `cloud-provider`,
`external-integration-card`. The normalized tool **simulates the score** and
rejects any item that lowers it.

## Secret redaction

Secrets are never written into drawings, exports, tool responses, logs or saved
scenes. JWTs, bearer tokens, provider keys, service-role keys, database URLs,
webhook/proxy secrets and `NAME=secret` assignments are replaced with
`[REDACTED_<TYPE>]`. Still, never paste real secrets into labels.

## Generate architecture from a repo

`create_from_repo_analysis` accepts a rich model — `actors`, `apps`, `gateways`,
`services`, `workers`, `queues`, `databases`, `integrations`, `auth`/`security`,
`observability`, `risks`, `flows` — and produces a framed, zoned, routed diagram
with a legend (it never stubs and never leaks secrets).

## Troubleshooting

- **`/mcp` returns HTML** — you hit the SPA, not the API. Point the client at the
  backend origin (e.g. `https://your-domain/mcp`), not the frontend dev server.
- **401 Unauthorized** — missing/invalid `Authorization: Bearer exd_…`. Generate
  a key in Settings; revoked keys are rejected. `GET /mcp` returns 405 (use POST).
- **`tools/list` is not 25** — you're on an old build; rebuild/redeploy the
  backend. The count is asserted in tests.
- **`prompts/list` is empty / not 25** — the client may not request prompts, or
  the server predates this release. Confirm `initialize` returns
  `capabilities.prompts`.
- **Skills don't appear in Claude Code** — `claude mcp add` does not install
  skills. Run the installer (see [skills.md](skills.md)) and restart Claude Code.
- **Libraries don't download** — only the official allowlisted source is
  fetchable, size-limited and cached on the volume; check `LIBRARY_*` env and the
  cache dir. Without a cache, generation still works (pure vector layout).
- **Score looks like a false positive** — call `score_drawing` and read
  `hardBlockers` + `mathematicalEvidence`; if you believe a finding is wrong,
  `lint_drawing` shows the exact element ids and measured geometry.
