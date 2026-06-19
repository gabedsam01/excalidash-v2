# @gabedsam01/excalidash-v2-skills

Zero-dependency npm/npx installer for the ExcaliDash V2 Agent Skills. It copies
the packaged skills into Claude Code or universal agent skill directories
without creating an extra `excalidash/` nesting level.

ExcaliDash V2 preserves credit to the original ExcaliDash project by
ZimengXiong and distributes this package under the repository's AGPL-3.0
license.

## What are Agent Skills?

An Agent Skill is a directory containing a `SKILL.md` instruction file and
optional on-demand resources:

```txt
excalidash-c4-context/
  SKILL.md
  references/
  scripts/
  assets/        # when provided by the skill
```

The shared `_shared/` directory is installed with every selection because
skills can reference its reusable guidance and scripts. `_shared` is not
reported as a skill because it has no `SKILL.md`.

## Install

Install in the current repository:

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

The CLI requires an explicit target. Running it without arguments prints help
and does not install anything.

## Select an agent

The default is `--agent all`.

```bash
npx -y @gabedsam01/excalidash-v2-skills --local --agent claude-code
npx -y @gabedsam01/excalidash-v2-skills --local --agent codex
npx -y @gabedsam01/excalidash-v2-skills --local --agent universal
npx -y @gabedsam01/excalidash-v2-skills --local --agent all
```

| Agent | Destination |
| --- | --- |
| `claude-code` | `.claude/skills` |
| `codex` | `.agents/skills` |
| `universal` | `.agents/skills` |
| `all` | both destinations |

## Select skills

Without `--skill`, every valid packaged skill is installed. Repeat `--skill`
to install a subset:

```bash
npx -y @gabedsam01/excalidash-v2-skills --local --skill excalidash-c4-context
npx -y @gabedsam01/excalidash-v2-skills --local \
  --skill excalidash-c4-context \
  --skill excalidash-c4-container
```

`_shared` is always copied with the selected skills.

## List, verify, diagnose, and remove

```bash
npx -y @gabedsam01/excalidash-v2-skills --list
npx -y @gabedsam01/excalidash-v2-skills --verify
npx -y @gabedsam01/excalidash-v2-skills --verify --local
npx -y @gabedsam01/excalidash-v2-skills --doctor --local
npx -y @gabedsam01/excalidash-v2-skills --uninstall --local
```

`--verify` without a target validates the skills packaged with the CLI.
Targeted verification checks the installation manifest, required files,
frontmatter, shared resources, and content hashes.

Uninstall removes only paths recorded in
`.excalidash-v2-skills-manifest.json`. Modified installed directories are kept
unless `--force` is supplied.

## Paths created

| Target | Claude Code | Universal/Codex |
| --- | --- | --- |
| `--local` | `./.claude/skills/` | `./.agents/skills/` |
| `--user` | `~/.claude/skills/` | `~/.agents/skills/` |
| `--project ./meu-projeto` | `./meu-projeto/.claude/skills/` | `./meu-projeto/.agents/skills/` |

Skills are direct children of these directories:

```txt
.claude/skills/excalidash-c4-context/SKILL.md
.claude/skills/_shared/references/
.agents/skills/excalidash-c4-context/SKILL.md
.agents/skills/_shared/references/
```

## Existing files and automation

- Existing directories are skipped with a clear warning.
- `--yes` updates existing directories only when the manifest shows they were
  installed by this package.
- `--force` overwrites existing selected directories.
- `--dry-run` reports copy or removal actions without changing files.
- `--json` emits machine-readable output.
- `--global` is accepted as an alias for `--user`.

No symlinks are created.

## Security

Install and verify never execute scripts contained in a skill. Scripts are
copied as files for an agent to load or for a user to run deliberately.
Verification rejects symbolic links and obvious executable binary formats.

When configuring ExcaliDash integrations, use local examples such as
`http://localhost:3000/mcp` and placeholder credentials such as
`YOUR_API_TOKEN`; never commit real secrets.

## Development

```bash
npm test
npm run verify
npm run pack:dry-run
```
