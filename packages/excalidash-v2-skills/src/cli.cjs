'use strict';

const fs = require('fs');
const path = require('path');

const { parseArgs, UsageError } = require('./args.cjs');
const { PACKAGE_NAME, PACKAGE_VERSION, SHARED_DIR } = require('./constants.cjs');
const { replaceDirectory } = require('./copy.cjs');
const {
  buildManifest,
  isOwnedManifest,
  readManifest,
  removeManifest,
  writeManifest,
} = require('./manifest.cjs');
const { printError, printResult } = require('./output.cjs');
const {
  isWritableTarget,
  resolveDestinations,
  resolveSourceDir,
} = require('./paths.cjs');
const {
  discoverSkills,
  hashDirectory,
  isDirectory,
  selectSkills,
} = require('./skills.cjs');
const { verifySource, verifyTarget } = require('./verify.cjs');

function main(argv) {
  let options = { json: argv.includes('--json') };
  try {
    options = parseArgs(argv);

    if (options.help || argv.length === 0) {
      printResult({ ok: true, operation: 'help', text: helpText() }, options);
      return 0;
    }
    if (options.version) {
      printResult({ ok: true, operation: 'version', version: PACKAGE_VERSION }, options);
      return 0;
    }

    const sourceDir = resolveSourceDir();
    const discovered = discoverSkills(sourceDir);
    const selected = selectSkills(discovered.skills, options.skills);
    let result;

    if (options.operation === 'list') {
      result = {
        ok: true,
        operation: 'list',
        package: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        skillCount: discovered.skills.length,
        skills: discovered.skills.map(({ name, description }) => ({ name, description })),
      };
    } else if (options.operation === 'verify') {
      result = runVerify(options, sourceDir);
    } else if (options.operation === 'doctor') {
      result = runDoctor(options, sourceDir, discovered);
    } else if (options.operation === 'uninstall') {
      result = runUninstall(options);
    } else if (options.operation === 'install') {
      result = runInstall(options, sourceDir, selected);
    } else {
      throw new UsageError('No operation selected.');
    }

    printResult(result, options);
    return result.ok === false ? 1 : 0;
  } catch (error) {
    printError(error, options);
    return error instanceof UsageError ? 2 : 1;
  }
}

function runInstall(options, sourceDir, selectedSkills) {
  const sourceShared = path.join(sourceDir, SHARED_DIR);
  if (!isDirectory(sourceShared)) throw new Error('The packaged _shared directory is missing.');

  const targets = resolveDestinations(options.target, options.agent).map((destination) =>
    installDestination(destination, sourceShared, selectedSkills, options)
  );
  return {
    ok: true,
    operation: 'install',
    dryRun: Boolean(options.dryRun),
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    targets,
  };
}

function installDestination(destination, sourceShared, selectedSkills, options) {
  const manifestResult = readManifest(destination.dir);
  if (manifestResult.problem && !options.force) {
    throw new Error(`${manifestResult.problem}. Use --force to replace it.`);
  }
  if (manifestResult.manifest && !isOwnedManifest(manifestResult.manifest) && !options.force) {
    throw new Error(
      `Manifest at ${manifestResult.file} belongs to another package. Use --force to replace it.`
    );
  }

  const ownedManifest = isOwnedManifest(manifestResult.manifest) ? manifestResult.manifest : null;
  const previousSkills = new Map(
    (ownedManifest && Array.isArray(ownedManifest.skills) ? ownedManifest.skills : [])
      .filter((entry) => entry && entry.name)
      .map((entry) => [entry.name, entry])
  );
  const nextSkills = new Map();

  for (const [name, entry] of previousSkills) {
    if (isDirectory(path.join(destination.dir, entry.path || name))) nextSkills.set(name, entry);
  }

  const actions = [];
  let changed = false;
  for (const skill of selectedSkills) {
    const targetPath = path.join(destination.dir, skill.name);
    const owned = previousSkills.has(skill.name);
    const decision = installDecision(targetPath, owned, options);
    actions.push({ name: skill.name, status: decision.status, reason: decision.reason });

    if (decision.copy) {
      if (!options.dryRun) {
        fs.mkdirSync(destination.dir, { recursive: true });
        replaceDirectory(skill.dir, targetPath);
      }
      nextSkills.set(skill.name, {
        name: skill.name,
        path: skill.name,
        hash: hashDirectory(skill.dir),
      });
      changed = true;
    }
  }

  const sharedTarget = path.join(destination.dir, SHARED_DIR);
  const sharedOwned = Boolean(ownedManifest && ownedManifest.shared);
  const sharedDecision = installDecision(sharedTarget, sharedOwned, options);
  actions.push({ name: SHARED_DIR, status: sharedDecision.status, reason: sharedDecision.reason });

  let nextShared = ownedManifest ? ownedManifest.shared : null;
  if (sharedDecision.copy) {
    if (!options.dryRun) {
      fs.mkdirSync(destination.dir, { recursive: true });
      replaceDirectory(sourceShared, sharedTarget);
    }
    nextShared = {
      path: SHARED_DIR,
      hash: hashDirectory(sourceShared),
    };
    changed = true;
  }

  const manifest = buildManifest({
    agent: destination.agent,
    installedAt: changed ? new Date().toISOString() : ownedManifest && ownedManifest.installedAt,
    shared: nextShared,
    skills: [...nextSkills.values()],
    targetDir: destination.dir,
  });

  const ownsAnything = manifest.skills.length > 0 || manifest.shared;
  if (ownsAnything && !options.dryRun && (changed || ownedManifest)) {
    writeManifest(destination.dir, manifest);
  }

  return {
    agent: destination.agent,
    targetDir: destination.dir,
    manifest: ownsAnything ? path.join(destination.dir, '.excalidash-v2-skills-manifest.json') : null,
    actions,
  };
}

function installDecision(targetPath, owned, options) {
  if (!fs.existsSync(targetPath)) return { copy: true, status: options.dryRun ? 'would-copy' : 'copied' };
  if (options.force) {
    return { copy: true, status: options.dryRun ? 'would-overwrite' : 'overwritten' };
  }
  if (options.yes && owned) {
    return { copy: true, status: options.dryRun ? 'would-update' : 'updated' };
  }
  return {
    copy: false,
    status: 'skipped',
    reason: owned
      ? 'already exists; use --yes to update this package installation or --force to overwrite'
      : 'already exists and is not owned by this package; use --force to overwrite',
  };
}

function runVerify(options, sourceDir) {
  const reports = options.target
    ? resolveDestinations(options.target, options.agent).map((destination) =>
        verifyTarget(destination.dir, options.skills)
      )
    : [verifySource(sourceDir, options.skills)];

  return {
    ok: reports.every((report) => report.ok),
    operation: 'verify',
    reports,
  };
}

function runUninstall(options) {
  const targets = resolveDestinations(options.target, options.agent).map((destination) =>
    uninstallDestination(destination, options)
  );
  return {
    ok: targets.every((target) => target.ok),
    operation: 'uninstall',
    dryRun: Boolean(options.dryRun),
    targets,
  };
}

function uninstallDestination(destination, options) {
  const manifestResult = readManifest(destination.dir);
  const actions = [];
  if (manifestResult.problem) {
    return {
      ok: false,
      agent: destination.agent,
      targetDir: destination.dir,
      actions: [{ name: 'manifest', status: 'failed', reason: manifestResult.problem }],
    };
  }
  if (!isOwnedManifest(manifestResult.manifest)) {
    return {
      ok: false,
      agent: destination.agent,
      targetDir: destination.dir,
      actions: [{
        name: 'manifest',
        status: 'failed',
        reason: manifestResult.manifest
          ? `belongs to ${manifestResult.manifest.package || 'another package'}`
          : 'not found',
      }],
    };
  }

  const manifest = manifestResult.manifest;
  const recordedSkills = Array.isArray(manifest.skills) ? manifest.skills : [];
  const requested = options.skills.length > 0
    ? new Set(options.skills)
    : new Set(recordedSkills.map((entry) => entry.name));
  const unknown = [...requested].filter((name) => !recordedSkills.some((entry) => entry.name === name));
  if (unknown.length > 0) {
    return {
      ok: false,
      agent: destination.agent,
      targetDir: destination.dir,
      actions: unknown.map((name) => ({ name, status: 'failed', reason: 'not recorded in manifest' })),
    };
  }

  const remaining = [];
  for (const entry of recordedSkills) {
    if (!requested.has(entry.name)) {
      remaining.push(entry);
      continue;
    }
    const targetPath = path.join(destination.dir, entry.path || entry.name);
    const decision = removalDecision(targetPath, entry.hash, options);
    actions.push({ name: entry.name, status: decision.status, reason: decision.reason });
    if (decision.remove) {
      if (!options.dryRun) fs.rmSync(targetPath, { force: true, recursive: true });
    } else {
      remaining.push(entry);
    }
  }

  let shared = manifest.shared || null;
  if (remaining.length === 0 && shared) {
    const sharedPath = path.join(destination.dir, shared.path || SHARED_DIR);
    const decision = removalDecision(sharedPath, shared.hash, options);
    actions.push({ name: SHARED_DIR, status: decision.status, reason: decision.reason });
    if (decision.remove) {
      if (!options.dryRun) fs.rmSync(sharedPath, { force: true, recursive: true });
      shared = null;
    }
  }

  if (!options.dryRun) {
    if (remaining.length === 0 && !shared) {
      removeManifest(destination.dir);
    } else {
      writeManifest(
        destination.dir,
        buildManifest({
          agent: manifest.agent || destination.agent,
          installedAt: manifest.installedAt,
          shared,
          skills: remaining,
          targetDir: destination.dir,
        })
      );
    }
  }

  return {
    ok: true,
    agent: destination.agent,
    targetDir: destination.dir,
    actions,
  };
}

function removalDecision(targetPath, expectedHash, options) {
  if (!fs.existsSync(targetPath)) {
    return { remove: true, status: options.dryRun ? 'would-clean-record' : 'cleaned-record' };
  }
  if (!isDirectory(targetPath)) {
    if (options.force) {
      return { remove: true, status: options.dryRun ? 'would-remove' : 'removed' };
    }
    return { remove: false, status: 'skipped', reason: 'path is not a directory; use --force' };
  }
  const modified = hashDirectory(targetPath) !== expectedHash;
  if (modified && !options.force) {
    return { remove: false, status: 'skipped', reason: 'modified after installation; use --force' };
  }
  return { remove: true, status: options.dryRun ? 'would-remove' : 'removed' };
}

function runDoctor(options, sourceDir, discovered) {
  const target = options.target || { kind: 'local' };
  const targets = resolveDestinations(target, options.agent).map((destination) => {
    const manifestResult = readManifest(destination.dir);
    const problems = [];
    if (manifestResult.problem) problems.push(manifestResult.problem);
    if (manifestResult.manifest && !isOwnedManifest(manifestResult.manifest)) {
      problems.push(`Manifest belongs to ${manifestResult.manifest.package || 'another package'}`);
    }
    const installedSkills = isOwnedManifest(manifestResult.manifest) && Array.isArray(manifestResult.manifest.skills)
      ? manifestResult.manifest.skills.map((entry) => entry.name)
      : [];
    const writable = isWritableTarget(destination.dir);
    if (!writable) problems.push('Target directory or its nearest existing parent is not writable');
    return {
      agent: destination.agent,
      targetDir: destination.dir,
      writable,
      manifest: manifestResult.manifest ? manifestResult.file : null,
      installedSkills,
      problems,
    };
  });

  const sourceReport = verifySource(sourceDir, []);
  const problems = [...sourceReport.problems];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 18) problems.push('Node.js 18 or newer is required');
  for (const targetReport of targets) problems.push(...targetReport.problems);

  return {
    ok: problems.length === 0,
    operation: 'doctor',
    nodeVersion: process.version,
    package: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    sourceDir,
    availableSkillCount: discovered.skills.length,
    targets,
    problems,
  };
}

function helpText() {
  return [
    `${PACKAGE_NAME} ${PACKAGE_VERSION}`,
    '',
    'Install ExcaliDash V2 Agent Skills for Claude Code and universal agents.',
    '',
    'Usage:',
    '  excalidash-v2-skills --local [options]',
    '  excalidash-v2-skills --user [options]',
    '  excalidash-v2-skills --project <path> [options]',
    '  excalidash-v2-skills --list',
    '  excalidash-v2-skills --verify [target]',
    '  excalidash-v2-skills --uninstall <target>',
    '  excalidash-v2-skills --doctor [target]',
    '',
    'Targets:',
    '  --local              Current repository',
    '  --user, --global     User home directory',
    '  --project <path>     Another project directory',
    '',
    'Options:',
    '  --agent <name>       all (default), claude-code, codex, universal',
    '  --skill <name>       Install/verify/uninstall one skill; repeatable',
    '  --dry-run            Show changes without writing',
    '  --yes                Update existing items owned by this package',
    '  --force              Overwrite or remove modified installed items',
    '  --json               Emit machine-readable JSON',
    '  --help               Show this help',
    '  --version            Show package version',
    '',
    'Examples:',
    '  npx -y @gabedsam01/excalidash-v2-skills --local',
    '  npx -y @gabedsam01/excalidash-v2-skills --user',
    '  npx -y @gabedsam01/excalidash-v2-skills --project ./my-project',
    '  npx -y @gabedsam01/excalidash-v2-skills --verify --local',
  ].join('\n');
}

module.exports = { main };
