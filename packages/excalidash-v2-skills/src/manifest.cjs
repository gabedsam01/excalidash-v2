'use strict';

const fs = require('fs');
const path = require('path');

const { MANIFEST_NAME, PACKAGE_NAME, PACKAGE_VERSION } = require('./constants.cjs');

function manifestPath(targetDir) {
  return path.join(targetDir, MANIFEST_NAME);
}

function readManifest(targetDir) {
  const file = manifestPath(targetDir);
  if (!fs.existsSync(file)) return { file, manifest: null, problem: null };

  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { file, manifest, problem: null };
  } catch (error) {
    return { file, manifest: null, problem: `Cannot parse manifest: ${error.message}` };
  }
}

function buildManifest({ agent, installedAt, shared, skills, targetDir }) {
  return {
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    installedAt: installedAt || new Date().toISOString(),
    agent,
    targetDir: path.resolve(targetDir),
    skills: [...skills].sort((left, right) => left.name.localeCompare(right.name)),
    shared: shared || null,
  };
}

function writeManifest(targetDir, manifest) {
  fs.mkdirSync(targetDir, { recursive: true });
  const file = manifestPath(targetDir);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function removeManifest(targetDir) {
  fs.rmSync(manifestPath(targetDir), { force: true });
}

function isOwnedManifest(manifest) {
  return Boolean(manifest && manifest.package === PACKAGE_NAME);
}

module.exports = {
  buildManifest,
  isOwnedManifest,
  manifestPath,
  readManifest,
  removeManifest,
  writeManifest,
};
