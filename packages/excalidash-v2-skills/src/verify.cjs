'use strict';

const fs = require('fs');
const path = require('path');

const { PACKAGE_NAME, SHARED_DIR } = require('./constants.cjs');
const { isOwnedManifest, readManifest } = require('./manifest.cjs');
const {
  discoverSkills,
  hashDirectory,
  isDirectory,
  selectSkills,
  validateSharedDirectory,
  validateSkillDirectory,
} = require('./skills.cjs');

function verifySource(sourceDir, requestedSkills) {
  const discovered = discoverSkills(sourceDir);
  const selected = selectSkills(discovered.skills, requestedSkills);
  const problems = [];

  for (const invalid of discovered.invalidDirectories) {
    problems.push(`${invalid}: directory does not contain SKILL.md`);
  }
  for (const skill of selected) {
    problems.push(...validateSkillDirectory(skill.dir, skill.name));
  }
  problems.push(...validateSharedDirectory(path.join(sourceDir, SHARED_DIR)));

  return {
    ok: problems.length === 0,
    scope: 'package',
    sourceDir,
    skillCount: selected.length,
    skills: selected.map((skill) => skill.name),
    shared: discovered.hasShared,
    problems,
  };
}

function verifyTarget(targetDir, requestedSkills) {
  const manifestResult = readManifest(targetDir);
  const problems = [];
  if (manifestResult.problem) problems.push(manifestResult.problem);
  if (!manifestResult.manifest) {
    problems.push(`Manifest not found: ${manifestResult.file}`);
    return {
      ok: false,
      scope: 'installation',
      targetDir,
      skills: [],
      problems,
    };
  }

  const manifest = manifestResult.manifest;
  if (!isOwnedManifest(manifest)) {
    problems.push(`Manifest belongs to ${manifest.package || 'an unknown package'}, not ${PACKAGE_NAME}`);
  }
  if (path.resolve(manifest.targetDir || '') !== path.resolve(targetDir)) {
    problems.push('Manifest targetDir does not match the directory being verified');
  }

  const manifestSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
  const manifestByName = new Map(manifestSkills.map((skill) => [skill.name, skill]));
  const names = requestedSkills && requestedSkills.length > 0
    ? requestedSkills
    : manifestSkills.map((skill) => skill.name);

  for (const name of names) {
    const entry = manifestByName.get(name);
    if (!entry) {
      problems.push(`${name}: not recorded in manifest`);
      continue;
    }
    const skillDir = path.join(targetDir, entry.path || name);
    if (!isDirectory(skillDir)) {
      problems.push(`${name}: installed directory is missing`);
      continue;
    }
    problems.push(...validateSkillDirectory(skillDir, name));
    const currentHash = hashDirectory(skillDir);
    if (currentHash !== entry.hash) {
      problems.push(`${name}: content hash differs from manifest`);
    }
  }

  if (!manifest.shared || !manifest.shared.path) {
    problems.push('_shared: not recorded in manifest');
  } else {
    const sharedDir = path.join(targetDir, manifest.shared.path);
    problems.push(...validateSharedDirectory(sharedDir));
    if (isDirectory(sharedDir) && hashDirectory(sharedDir) !== manifest.shared.hash) {
      problems.push('_shared: content hash differs from manifest');
    }
  }

  return {
    ok: problems.length === 0,
    scope: 'installation',
    targetDir,
    agent: manifest.agent,
    packageVersion: manifest.version,
    skills: names,
    problems,
  };
}

module.exports = { verifySource, verifyTarget };
