#!/usr/bin/env node
// install-skills.cjs — Thin wrapper around the ExcaliDash V2 skills installer.
//
// Usage:
//   node install-skills.cjs [args...]
//
// Locates the installer either in a repository checkout or in the published
// package bundle and executes it, forwarding all CLI arguments.
//
// If the installer is not present (e.g. running from a checkout without the
// packages workspace), it prints the documented npx/node commands to run the
// installer from npm instead.
//
// Exit codes:
//   0   installer ran successfully (or guidance printed when missing)
//   !0  installer's own exit code on failure

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const INSTALLER_CANDIDATES = [
  path.join(
    PACKAGE_ROOT,
    'packages',
    'excalidash-v2-skills',
    'bin',
    'excalidash-v2-skills.cjs'
  ),
  path.join(PACKAGE_ROOT, 'bin', 'excalidash-v2-skills.cjs'),
];
const INSTALLER = INSTALLER_CANDIDATES.find((candidate) => fs.existsSync(candidate));

function printFallback() {
  process.stdout.write(
    [
      'ExcaliDash V2 skills installer not found at:',
      ...INSTALLER_CANDIDATES.map((candidate) => `  ${candidate}`),
      '',
      'Run the published installer instead:',
      '',
      '  # via npx (no install):',
      '  npx -y @gabedsam01/excalidash-v2-skills --local',
      '',
      '  # or install globally, then run:',
      '  npm install -g @gabedsam01/excalidash-v2-skills',
      '  excalidash-v2-skills --local',
      '',
      '  # or run a locally cloned package directly:',
      '  node packages/excalidash-v2-skills/bin/excalidash-v2-skills.cjs --local',
      '',
    ].join('\n')
  );
}

function main() {
  const forwarded = process.argv.slice(2);

  if (!INSTALLER) {
    printFallback();
    process.exit(0);
  }

  const result = spawnSync(process.execPath, [INSTALLER, ...forwarded], {
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(`install-skills: failed to exec installer: ${result.error.message}\n`);
    process.exit(1);
  }

  process.exit(result.status == null ? 1 : result.status);
}

main();
