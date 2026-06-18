# @excalidash/claude-skills

Installer that copies the **ExcaliDash Claude Code skills** into a Claude Code
skills directory. Pure Node (CommonJS), **zero runtime dependencies**.

ExcaliDash ships two kinds of agent extensions:

- **MCP prompts/tools** — these appear **automatically** in Claude Code once you
  register the MCP server with `claude mcp add ...`. You do not copy anything.
- **Claude Code skills** — these are plain files that Claude Code reads from a
  `.claude/skills/` directory. They are **not** delivered by MCP, so they must be
  **installed / copied** into a skills directory. That is exactly what this
  package does.

The skills are installed under an `excalidash/` bundle inside the chosen skills
directory, so they never collide with your other skills.

## Targets

| Scope            | Destination                                       |
| ---------------- | ------------------------------------------------- |
| `user`           | `~/.claude/skills/excalidash/`                    |
| `project`/`local`| `<project-dir>/.claude/skills/excalidash/`        |

## Install

### Via npx (recommended, no install)

User scope (available in every project on this machine):

```bash
npx -y @excalidash/claude-skills install --scope user
```

Project / local scope (committed alongside a specific repo):

```bash
npx -y @excalidash/claude-skills install --scope project --project-dir .
```

`--scope local` is an alias of `--scope project` and uses the same
`<project-dir>/.claude/skills/excalidash/` location.

### Local fallback (running from a checkout, no npm)

If you have the ExcaliDash repo checked out, run the bundled installer directly:

```bash
node packages/excalidash-claude-skills/bin/install.cjs install --scope user
```

All the same subcommands and flags work this way.

## Commands

### list

List the available skills and their descriptions (read from each
`SKILL.md` frontmatter):

```bash
npx -y @excalidash/claude-skills list
```

### install

```bash
npx -y @excalidash/claude-skills install --scope user [--force]
npx -y @excalidash/claude-skills install --scope project --project-dir . [--force]
```

- Recursively copies every skill directory (including the shared `_shared`
  directory) to the target, creating directories as needed.
- **Idempotent and safe:** it refuses to overwrite an existing, non-empty target
  unless you pass `--force`.
- Prints each skill as it is copied.

### uninstall

Remove the installed `excalidash` skills directory at the target:

```bash
npx -y @excalidash/claude-skills uninstall --scope user
npx -y @excalidash/claude-skills uninstall --scope project --project-dir .
```

### verify

Check that all 25 skills + `_shared` exist at the target, and that each
`SKILL.md` has the required `name`, `description`, and `allowed-tools`
frontmatter. Prints a checklist and exits non-zero if anything is missing:

```bash
# verify what is installed at a scope
npx -y @excalidash/claude-skills verify --scope user
npx -y @excalidash/claude-skills verify --scope project --project-dir .

# verify the source bundle (no --scope)
npx -y @excalidash/claude-skills verify
```

## Source resolution

When copying/verifying, the source skills directory is resolved in this order
(first match wins):

1. `$EXCALIDASH_SKILLS_DIR` environment variable.
2. The `./skills/excalidash` directory bundled next to this package.
3. The repo path `/home/ubuntu/ExcaliDash/skills/excalidash`.

## Options

| Option          | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `--scope`       | `user` \| `project` \| `local`.                             |
| `--project-dir` | Project root for `project`/`local` scope (default `.`).     |
| `--force`       | Overwrite existing files when installing.                   |
| `-h`, `--help`  | Show help.                                                  |

## Exit codes

| Code | Meaning       |
| ---- | ------------- |
| `0`  | success       |
| `1`  | failure       |
| `2`  | usage error   |

## License

MIT
