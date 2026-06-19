# Visual Quality Pipeline — implementation

Implements the plan in [visual-quality-study.md](visual-quality-study.md). Goal: turn
"box + arrow + text" into "right icon + grouped card + premium layout + coherent colours +
legend + visual score + repair loop". This document is the implementation reference.

## What changed (modules)

| Area | Module | Role |
|---|---|---|
| Bundled icons | `backend/src/libraries/bundled/glyphs.ts` | Offline, native-vector icon glyphs (one stroke / roughness 0 / ~88px box), provenance-tagged. Never ships raster or 3rd-party IP. |
| Bundled library | `backend/src/libraries/bundled/index.ts` | Synthetic v2 `.excalidrawlib` document + catalog descriptor (`bundled:` ids). |
| Concept resolver | `backend/src/libraries/conceptIndex.ts` | `resolveConcept(label)` → best glyph (brand specificity tiebreaker); `null` for unrecognized. Server-side — the model never guesses an itemName. |
| Auto-injection | `backend/src/mcp/generate/iconInjection.ts` | After layout: widen card, re-center label, drop the glyph in a reserved slot, group card+label+icon under one `groupId`, per-card score guard. |
| Aesthetic lint | `backend/src/mcp/quality/style.ts` | `STYLE_DRIFT`, `TOO_MANY_COLORS`, `LOW_CONTRAST` (real WCAG luminance/contrast), `MISSING_ICON`, `TYPO_HIERARCHY`. Gated (default off). |
| Score | `backend/src/mcp/quality/score.ts` | Folds `DIMENSION_WEIGHT` into the headline (heavy dims move it more). New codes in plan/suggestions. |
| Style fixers | `backend/src/mcp/quality/styleFix.ts` | `NORMALIZE_STYLE`, `INCREASE_FONT_SIZE`, `FIX_LOW_CONTRAST`. |
| Repair loop | `backend/src/mcp/quality/repairLoop.ts` | `runRepairLoop`: geometry + style + icon injection, best-kept with rollback, terminates at `maxRounds`. Server-driven (no model self-grading). |
| Visual score | `backend/src/mcp/quality/visualScore.ts` | `scoreVisualFromPixels` (rendered) + `scoreVisualFromScene` (proxy) + `blendScore` (geometry-dominant). |
| Capture | `e2e/visual-capture.ts` | Playwright: open `/editor/:id`, stable-bytes settle, extract a down-sampled RGBA grid for the pixel scorer. |
| Legend | `backend/src/mcp/templates/legend.ts` | `renderLegend`/`ensureLegend` — grouped key (solid=sync, dashed=async, node swatches). |
| Tokens | `backend/src/mcp/templates/visualTokens.ts` | `ARCHITECTURE_LINT_OVERRIDES`, `isArchitectureDiagram`, 3-hue palette. |

## Flow (create path)

`create_diagram_from_prompt` / `apply_architecture_skill` / `create_from_repo_analysis`
→ `generateDiagramScene` → `layoutGraph` (primitive cards) → `polishAndMaybeSave`:
1. `autoPolish` (geometry repair to the bar).
2. **auto icon injection** (`injectConceptIcons`) — recognized nodes get real grouped glyphs, score-guarded. Opt-out: `MCP_LIBRARY_MODE=off`.
3. **legend** (`ensureLegend`) for architecture diagrams.
4. `scoreScene` with architecture gates (icon/legend/rich-shape) when applicable.

The model no longer has to remember a second `add_library_items` call.

## New MCP tools (now 27)

- `score_drawing_visual` — aesthetic 0-100 (icon coverage, colour discipline, whitespace,
  legibility). Uses a rendered pixel grid when provided, else the scene proxy; blended with
  geometry by default.
- `run_repair_loop` — server-driven geometry+style+icon loop, best-kept with rollback.

## Bundled fallback (offline)

The remote catalog (official `excalidraw-libraries`) is unchanged. When it is empty/unreachable:
`search_libraries` surfaces the bundled pack, `cache_library` returns success (no 404),
`add_library_items`/auto-injection serve `bundled:` items from memory. So the MCP is never
without icons.

## How to test

```bash
cd backend && npm run build && npm test     # 27 tools, conceptIndex, style, injection, loop, visual, fallback, legend
cd frontend && npm run build && npm test
cd e2e && npm test                          # existing Playwright e2e (needs the local stack)
# rendered visual capture (needs the e2e stack up):
PW_CHROMIUM=<chromium> npx tsx e2e/visual-capture.ts http://localhost:6767/editor/<id> /tmp/grid.json
```

New backend test files: `conceptIndex.test.ts`, `quality/style.test.ts`,
`generate/iconInjection.test.ts`, `quality/repairLoop.test.ts`, `quality/visualScore.test.ts`,
`libraries/bundledFallback.test.ts`, `templates/legend.test.ts`.

## Limitations / next steps

- **Bundled glyphs are clean generic-but-consistent vector icons** (database cylinder, API
  hexagon, browser, container, gear, padlock, …), not pixel-accurate vendor logos. Real brand
  art still comes from the remote catalog via `add_library_items`. Extracting a curated MIT
  subset of real `.excalidrawlib` glyphs into the bundle (with provenance) is a follow-up.
- **`enforceStyleTokens` (>3-hue) is not auto-enabled on the create path** because `layoutGraph`
  still assigns one palette colour per layer (can exceed 3 hues). Constrain the layout to the
  3-hue `ARCHITECTURE_PALETTE` first, then enable the gate.
- **Rendered visual scoring is out-of-process** (Playwright capture → `score_drawing_visual`
  with `pixels`). The in-loop score is geometry + style; wiring the rendered pass into
  `run_repair_loop` (re-render between rounds) is a follow-up.
- **UI surfacing (Part 9)** — geometry/visual/combined score + auto-polish button in the
  editor/dashboard — is not yet implemented (backend-first round).
- Connector-density fixers (`ROUTE_DENSE_CONNECTORS`) and `REDUCE_COLOR_DRIFT` are listed
  hooks; only geometry/style/icon/legend fixers are wired so far.
```
