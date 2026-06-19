'use strict';

const VALID_AGENTS = new Set(['all', 'claude-code', 'codex', 'universal']);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function parseArgs(argv) {
  const result = {
    agent: 'all',
    skills: [],
    targets: [],
  };

  const booleanFlags = new Set([
    '--local',
    '--user',
    '--global',
    '--list',
    '--verify',
    '--uninstall',
    '--doctor',
    '--dry-run',
    '--yes',
    '--force',
    '--json',
    '--help',
    '--version',
  ]);
  const valueFlags = new Set(['--project', '--agent', '--skill']);

  for (let index = 0; index < argv.length; index += 1) {
    let token = argv[index];
    if (token === '-h') token = '--help';
    if (token === '-v') token = '--version';

    if (!token.startsWith('-')) {
      throw new UsageError(`Unexpected positional argument: ${token}`);
    }

    let flag = token;
    let inlineValue;
    const equalsIndex = token.indexOf('=');
    if (equalsIndex !== -1) {
      flag = token.slice(0, equalsIndex);
      inlineValue = token.slice(equalsIndex + 1);
    }

    if (booleanFlags.has(flag)) {
      if (inlineValue !== undefined) {
        throw new UsageError(`${flag} does not accept a value.`);
      }
      setBoolean(result, flag);
      continue;
    }

    if (valueFlags.has(flag)) {
      const value = inlineValue !== undefined ? inlineValue : argv[++index];
      if (!value || value.startsWith('--')) {
        throw new UsageError(`${flag} requires a value.`);
      }
      setValue(result, flag, value);
      continue;
    }

    throw new UsageError(`Unknown option: ${flag}`);
  }

  result.skills = [...new Set(result.skills)];
  result.targets = normalizeTargets(result.targets);

  if (!VALID_AGENTS.has(result.agent)) {
    throw new UsageError(
      `Invalid --agent "${result.agent}". Expected: all, claude-code, codex, or universal.`
    );
  }

  if (result.targets.length > 1) {
    throw new UsageError('Only one target may be used per execution: --local, --user, or --project.');
  }

  const operations = ['list', 'verify', 'uninstall', 'doctor'].filter((name) => result[name]);
  if (operations.length > 1) {
    throw new UsageError(`Choose only one operation: ${operations.map((name) => `--${name}`).join(', ')}.`);
  }

  result.target = result.targets[0] || null;
  result.operation = operations[0] || (result.target ? 'install' : null);

  if (result.uninstall && !result.target) {
    throw new UsageError('--uninstall requires --local, --user, or --project <path>.');
  }

  if (!result.operation && (result.dryRun || result.yes || result.force || result.skills.length > 0)) {
    throw new UsageError('Installation options require a target or an explicit operation.');
  }

  return result;
}

function setBoolean(result, flag) {
  const name = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  result[name] = true;

  if (flag === '--local') result.targets.push({ kind: 'local' });
  if (flag === '--user' || flag === '--global') result.targets.push({ kind: 'user' });
}

function setValue(result, flag, value) {
  if (flag === '--project') {
    result.targets.push({ kind: 'project', path: value });
  } else if (flag === '--agent') {
    result.agent = value;
  } else if (flag === '--skill') {
    result.skills.push(value);
  }
}

function normalizeTargets(targets) {
  const normalized = [];
  for (const target of targets) {
    const duplicate = normalized.some(
      (entry) => entry.kind === target.kind && (entry.path || '') === (target.path || '')
    );
    if (!duplicate) normalized.push(target);
  }
  return normalized;
}

module.exports = { UsageError, parseArgs };
