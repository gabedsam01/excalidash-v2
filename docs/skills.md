# ExcaliDash V2 Agent Skills

ExcaliDash V2 provides 25 Agent Skills for creating, reviewing, improving,
validating, and exporting Excalidraw diagrams through agent workflows. The
skills are stored in [`skills/excalidash/`](../skills/excalidash) and can be
installed for Claude Code, Codex, and agents that support the common
`.agents/skills` convention.

ExcaliDash V2 preserves credit to the original ExcaliDash project by
ZimengXiong.

## Skills and MCP prompts

Agent Skills and MCP prompts are separate:

- MCP prompts and tools are discovered by an MCP client after it connects to
  the ExcaliDash endpoint, such as `http://localhost:3000/mcp`.
- Agent Skills are local directories that contain instructions and supporting
  files. They must be installed into an agent skills directory.

Installing skills does not configure an MCP connection or copy credentials.

## Skill structure

Each valid skill is its own directory:

```txt
excalidash-c4-context/
  SKILL.md
  references/
  scripts/
  assets/        # when the skill provides assets
```

`SKILL.md` contains the main instructions and optional YAML frontmatter.
References, scripts, and assets are loaded only when needed by the agent.

The `_shared/` directory contains reusable references and scripts:

```txt
_shared/
  references/
  scripts/
```

It is installed with every skill selection because skills refer to it, but it
is not itself a skill and is not included in `--list`.

## Install via npx

Install in the current project:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local
```

Install for the current user:

```bash
npx -y @gabedsam01/excalidash-v2-skills --user
```

Install in another project:

```bash
npx -y @gabedsam01/excalidash-v2-skills --project ./meu-projeto
```

The CLI requires one explicit target for installation. Running it without
arguments prints help and makes no changes.

## Supported paths

| Target | Claude Code | Codex/universal agents |
| --- | --- | --- |
| `--local` | `./.claude/skills/` | `./.agents/skills/` |
| `--user` | `~/.claude/skills/` | `~/.agents/skills/` |
| `--project ./meu-projeto` | `./meu-projeto/.claude/skills/` | `./meu-projeto/.agents/skills/` |

Skills are installed directly inside each skills directory:

```txt
.claude/skills/excalidash-diagram-director/SKILL.md
.claude/skills/excalidash-c4-context/SKILL.md
.claude/skills/_shared/references/

.agents/skills/excalidash-diagram-director/SKILL.md
.agents/skills/excalidash-c4-context/SKILL.md
.agents/skills/_shared/references/
```

There is no intermediate `skills/excalidash/` directory.

## Claude Code

Install only the Claude Code path:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local --agent claude-code
```

This writes to `.claude/skills`. Restart or reload Claude Code after
installation if the skills are not detected immediately.

## Codex and universal agents

Install only the common `.agents/skills` path:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local --agent codex
```

`--agent universal` uses the same destination:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local --agent universal
```

The default, `--agent all`, installs both `.claude/skills` and
`.agents/skills`.

## Install selected skills

Without `--skill`, all valid skills are installed. Repeat `--skill` to select a
subset:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local \
  --skill excalidash-c4-context \
  --skill excalidash-c4-container
```

`_shared` is copied with any selection.

## List available skills

```bash
npx -y @gabedsam01/excalidash-v2-skills --list
```

The list is generated from directories that contain a non-empty `SKILL.md`;
`_shared` is excluded.

## Verify

Verify the skills bundled in the npm package:

```bash
npx -y @gabedsam01/excalidash-v2-skills --verify
```

Verify a local installation:

```bash
npx -y @gabedsam01/excalidash-v2-skills --verify --local
```

Verification checks:

- required `SKILL.md` files and non-empty content;
- minimal YAML frontmatter validity when frontmatter is present;
- referenced `references/` and `scripts/` directories;
- symbolic links and obvious executable binary formats;
- the installation manifest and recorded directory hashes.

Skill scripts are never executed during installation or verification.

## Remove

```bash
npx -y @gabedsam01/excalidash-v2-skills --uninstall --local
```

Each destination contains
`.excalidash-v2-skills-manifest.json`. Uninstall removes only directories
recorded in that manifest. If an installed directory changed after
installation, it is kept unless `--force` is supplied.

## Diagnostics and automation

```bash
npx -y @gabedsam01/excalidash-v2-skills --doctor --local
npx -y @gabedsam01/excalidash-v2-skills --local --dry-run
npx -y @gabedsam01/excalidash-v2-skills --list --json
```

`--doctor` reports Node.js and package versions, resolved target directories,
write permissions, available skills, installed skills, and detected problems.

Use placeholder credentials such as `YOUR_API_TOKEN` in examples and keep
local MCP testing on `http://localhost:3000/mcp`.
