'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { PACKAGE_ROOT } = require('./constants.cjs');

function resolveSourceDir() {
  const candidates = [];
  if (process.env.EXCALIDASH_SKILLS_DIR) {
    candidates.push(path.resolve(process.env.EXCALIDASH_SKILLS_DIR));
  }
  candidates.push(path.join(PACKAGE_ROOT, 'skills', 'excalidash'));
  candidates.push(path.resolve(PACKAGE_ROOT, '..', '..', 'skills', 'excalidash'));

  const sourceDir = candidates.find(isDirectory);
  if (!sourceDir) {
    throw new Error(
      `Could not locate bundled skills. Checked:\n${candidates.map((item) => `- ${item}`).join('\n')}`
    );
  }
  return sourceDir;
}

function resolveTargetRoot(target, cwd = process.cwd()) {
  if (!target) return path.resolve(cwd);
  if (target.kind === 'user') return os.homedir();
  if (target.kind === 'local') return path.resolve(cwd);
  if (target.kind === 'project') return path.resolve(cwd, target.path);
  throw new Error(`Unsupported target kind: ${target.kind}`);
}

function resolveDestinations(target, agent, cwd = process.cwd()) {
  const root = resolveTargetRoot(target, cwd);
  const destinations = [];

  if (agent === 'all' || agent === 'claude-code') {
    destinations.push({
      agent: 'claude-code',
      dir: path.join(root, '.claude', 'skills'),
    });
  }

  if (agent === 'all' || agent === 'codex' || agent === 'universal') {
    destinations.push({
      agent: agent === 'codex' ? 'codex' : 'universal',
      dir: path.join(root, '.agents', 'skills'),
    });
  }

  return destinations;
}

function isWritableTarget(targetDir) {
  let current = targetDir;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }

  try {
    fs.accessSync(current, fs.constants.W_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

function isDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch (_error) {
    return false;
  }
}

module.exports = {
  isWritableTarget,
  resolveDestinations,
  resolveSourceDir,
  resolveTargetRoot,
};
