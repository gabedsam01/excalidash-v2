'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { SHARED_DIR } = require('./constants.cjs');

const DANGEROUS_EXTENSIONS = new Set([
  '.class',
  '.com',
  '.dll',
  '.dylib',
  '.exe',
  '.jar',
  '.msi',
  '.node',
  '.scr',
  '.so',
]);

function discoverSkills(sourceDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const skills = [];
  const invalidDirectories = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === SHARED_DIR) continue;
    const skillDir = path.join(sourceDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (isFile(skillFile)) {
      const frontmatter = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
      skills.push({
        name: entry.name,
        dir: skillDir,
        description: frontmatter.values.description || '',
      });
    } else {
      invalidDirectories.push(entry.name);
    }
  }

  skills.sort((left, right) => left.name.localeCompare(right.name));
  invalidDirectories.sort();
  return {
    hasShared: isDirectory(path.join(sourceDir, SHARED_DIR)),
    invalidDirectories,
    skills,
  };
}

function selectSkills(available, requested) {
  if (!requested || requested.length === 0) return available;
  const byName = new Map(available.map((skill) => [skill.name, skill]));
  const missing = requested.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Unknown skill${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  return requested.map((name) => byName.get(name));
}

function validateSkillDirectory(skillDir, expectedName) {
  const problems = [];
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!isFile(skillFile)) {
    return [`${expectedName}: missing SKILL.md`];
  }

  const text = fs.readFileSync(skillFile, 'utf8');
  if (!text.trim()) problems.push(`${expectedName}: SKILL.md is empty`);

  const frontmatter = parseFrontmatter(text);
  problems.push(...frontmatter.problems.map((problem) => `${expectedName}: ${problem}`));
  if (frontmatter.present && frontmatter.values.name && frontmatter.values.name !== expectedName) {
    problems.push(
      `${expectedName}: frontmatter name "${frontmatter.values.name}" does not match directory`
    );
  }

  if (referencesPath(text) && !isDirectory(path.join(skillDir, 'references'))) {
    problems.push(`${expectedName}: SKILL.md cites references/ but the directory is missing`);
  }
  if (scriptsPath(text) && !isDirectory(path.join(skillDir, 'scripts'))) {
    problems.push(`${expectedName}: SKILL.md cites scripts/ but the directory is missing`);
  }

  problems.push(...scanDangerousFiles(skillDir).map((problem) => `${expectedName}: ${problem}`));
  return problems;
}

function validateSharedDirectory(sharedDir) {
  const problems = [];
  if (!isDirectory(sharedDir)) return ['_shared: directory is missing'];
  problems.push(...scanDangerousFiles(sharedDir).map((problem) => `_shared: ${problem}`));
  return problems;
}

function parseFrontmatter(input) {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) {
    return { present: false, problems: [], values: {} };
  }

  const closeIndex = text.indexOf('\n---', 4);
  if (closeIndex === -1) {
    return {
      present: true,
      problems: ['frontmatter is not closed with ---'],
      values: {},
    };
  }

  const values = {};
  const problems = [];
  let activeKey = null;
  const lines = text.slice(4, closeIndex).split('\n');

  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) return;

    if (/^\s/.test(rawLine)) {
      if (!activeKey) {
        problems.push(`frontmatter line ${index + 2} is indented without a parent key`);
      }
      return;
    }

    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      problems.push(`frontmatter line ${index + 2} is not a valid key/value entry`);
      activeKey = null;
      return;
    }

    activeKey = match[1];
    values[activeKey] = stripQuotes(match[2].trim());
  });

  return { present: true, problems, values };
}

function scanDangerousFiles(rootDir) {
  const problems = [];
  walk(rootDir, (absolutePath, relativePath, stat) => {
    if (stat.isSymbolicLink()) {
      problems.push(`symbolic link is not allowed: ${relativePath}`);
      return;
    }
    if (!stat.isDirectory() && !stat.isFile()) {
      problems.push(`unsupported filesystem entry: ${relativePath}`);
      return;
    }
    if (stat.isFile() && DANGEROUS_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      problems.push(`potentially dangerous binary file: ${relativePath}`);
    }
  });
  return problems;
}

function hashDirectory(rootDir) {
  const hash = crypto.createHash('sha256');
  const entries = [];

  walk(rootDir, (absolutePath, relativePath, stat) => {
    if (stat.isDirectory()) return;
    if (stat.isSymbolicLink()) {
      entries.push({ absolutePath, relativePath, symlink: true });
    } else if (stat.isFile()) {
      entries.push({ absolutePath, relativePath, symlink: false });
    }
  });

  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  for (const entry of entries) {
    hash.update(entry.relativePath);
    hash.update('\0');
    if (entry.symlink) {
      hash.update(`symlink:${fs.readlinkSync(entry.absolutePath)}`);
    } else {
      hash.update(fs.readFileSync(entry.absolutePath));
    }
    hash.update('\0');
  }
  return `sha256-${hash.digest('hex')}`;
}

function walk(rootDir, visitor, currentDir = rootDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
    const stat = fs.lstatSync(absolutePath);
    visitor(absolutePath, relativePath, stat);
    if (stat.isDirectory()) walk(rootDir, visitor, absolutePath);
  }
}

function referencesPath(text) {
  return /(?:^|[./`])references\//im.test(text);
}

function scriptsPath(text) {
  return /(?:^|[./`])scripts\//im.test(text);
}

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
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
  discoverSkills,
  hashDirectory,
  isDirectory,
  parseFrontmatter,
  selectSkills,
  validateSharedDirectory,
  validateSkillDirectory,
};
