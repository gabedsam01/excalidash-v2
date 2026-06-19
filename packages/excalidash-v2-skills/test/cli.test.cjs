'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const packageRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(packageRoot, '..', '..');
const bin = path.join(packageRoot, 'bin', 'excalidash-v2-skills.cjs');
const sourceSkills = path.join(repositoryRoot, 'skills', 'excalidash');
const c4Context = 'excalidash-c4-context';
const c4Container = 'excalidash-c4-container';

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'excalidash-v2-skills-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd || repositoryRoot,
    env: {
      ...process.env,
      EXCALIDASH_SKILLS_DIR: sourceSkills,
      ...(options.env || {}),
    },
    encoding: 'utf8',
  });
}

function runJson(args, options) {
  const result = run([...args, '--json'], options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('--list lists real packaged skills', () => {
  const result = runJson(['--list']);
  assert.equal(result.skillCount, 25);
  assert.ok(result.skills.some((skill) => skill.name === c4Context));
  assert.ok(result.skills.some((skill) => skill.name === 'excalidash-diagram-director'));
});

test('--verify validates the source package', () => {
  const result = runJson(['--verify']);
  assert.equal(result.ok, true);
  assert.equal(result.reports[0].skillCount, 25);
  assert.deepEqual(result.reports[0].problems, []);
});

test('--local with --agent all installs directly in both skills directories', (t) => {
  const cwd = temporaryDirectory(t);
  runJson(['--local', '--agent', 'all', '--skill', c4Context, '--yes'], { cwd });

  for (const agentDir of ['.claude', '.agents']) {
    const skillsDir = path.join(cwd, agentDir, 'skills');
    assert.ok(fs.existsSync(path.join(skillsDir, c4Context, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(skillsDir, '_shared', 'references')));
    assert.ok(fs.existsSync(path.join(skillsDir, '.excalidash-v2-skills-manifest.json')));
    assert.equal(fs.existsSync(path.join(skillsDir, 'excalidash', c4Context)), false);
  }

  const verified = runJson(['--verify', '--local', '--agent', 'all'], { cwd });
  assert.equal(verified.ok, true);
  assert.ok(verified.reports.every((report) => report.problems.length === 0));
});

test('--local without --skill installs every valid skill', (t) => {
  const cwd = temporaryDirectory(t);
  runJson(['--local', '--agent', 'claude-code', '--yes'], { cwd });

  const skillsDir = path.join(cwd, '.claude', 'skills');
  const installed = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => entry.name);
  assert.equal(installed.length, 25);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(skillsDir, '.excalidash-v2-skills-manifest.json'), 'utf8')
  );
  assert.equal(manifest.package, '@gabedsam01/excalidash-v2-skills');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.skills.length, 25);
  assert.match(manifest.shared.hash, /^sha256-[a-f0-9]{64}$/);
});

test('--project installs into the requested project', (t) => {
  const cwd = temporaryDirectory(t);
  const project = path.join(cwd, 'another-project');
  runJson(['--project', project, '--agent', 'claude-code', '--skill', c4Context, '--yes'], { cwd });

  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', c4Context, 'SKILL.md')));
  assert.equal(fs.existsSync(path.join(cwd, '.claude')), false);
});

test('--user installs below the user home directory', (t) => {
  const home = temporaryDirectory(t);
  runJson(['--user', '--agent', 'codex', '--skill', c4Context, '--yes'], {
    env: { HOME: home },
  });
  assert.ok(fs.existsSync(path.join(home, '.agents', 'skills', c4Context, 'SKILL.md')));
});

test('agent selection creates only the requested destination', (t) => {
  const claudeProject = path.join(temporaryDirectory(t), 'claude');
  runJson(['--project', claudeProject, '--agent', 'claude-code', '--skill', c4Context, '--yes']);
  assert.ok(fs.existsSync(path.join(claudeProject, '.claude', 'skills')));
  assert.equal(fs.existsSync(path.join(claudeProject, '.agents')), false);

  const codexProject = path.join(temporaryDirectory(t), 'codex');
  runJson(['--project', codexProject, '--agent', 'codex', '--skill', c4Context, '--yes']);
  assert.ok(fs.existsSync(path.join(codexProject, '.agents', 'skills')));
  assert.equal(fs.existsSync(path.join(codexProject, '.claude')), false);

  const universalProject = path.join(temporaryDirectory(t), 'universal');
  runJson(['--project', universalProject, '--agent', 'universal', '--skill', c4Context, '--yes']);
  assert.ok(fs.existsSync(path.join(universalProject, '.agents', 'skills')));
  assert.equal(fs.existsSync(path.join(universalProject, '.claude')), false);
});

test('--skill installs only requested skills plus _shared', (t) => {
  const cwd = temporaryDirectory(t);
  runJson([
    '--local',
    '--agent',
    'claude-code',
    '--skill',
    c4Context,
    '--skill',
    c4Container,
    '--yes',
  ], { cwd });

  const entries = fs.readdirSync(path.join(cwd, '.claude', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['_shared', c4Container, c4Context].sort());
});

test('--uninstall removes only manifest-owned items and protects modifications', (t) => {
  const cwd = temporaryDirectory(t);
  runJson(['--local', '--agent', 'claude-code', '--skill', c4Context, '--yes'], { cwd });

  const skillsDir = path.join(cwd, '.claude', 'skills');
  const skillFile = path.join(skillsDir, c4Context, 'SKILL.md');
  const unrelated = path.join(skillsDir, 'custom-skill');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'SKILL.md'), '# Custom\n', 'utf8');
  fs.appendFileSync(skillFile, '\nmodified locally\n', 'utf8');

  const protectedResult = runJson(['--uninstall', '--local', '--agent', 'claude-code'], { cwd });
  assert.equal(protectedResult.targets[0].actions[0].status, 'skipped');
  assert.ok(fs.existsSync(skillFile));

  runJson(['--uninstall', '--local', '--agent', 'claude-code', '--force'], { cwd });
  assert.equal(fs.existsSync(path.join(skillsDir, c4Context)), false);
  assert.equal(fs.existsSync(path.join(skillsDir, '_shared')), false);
  assert.ok(fs.existsSync(path.join(unrelated, 'SKILL.md')));
});

test('--dry-run does not write files', (t) => {
  const cwd = temporaryDirectory(t);
  const result = runJson(['--local', '--agent', 'all', '--skill', c4Context, '--dry-run'], { cwd });
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(path.join(cwd, '.claude')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.agents')), false);
});

test('existing skills are skipped without --force and overwritten with --force', (t) => {
  const cwd = temporaryDirectory(t);
  runJson(['--local', '--agent', 'claude-code', '--skill', c4Context, '--force'], { cwd });

  const skillFile = path.join(cwd, '.claude', 'skills', c4Context, 'SKILL.md');
  fs.writeFileSync(skillFile, '# Local override\n', 'utf8');

  const skipped = runJson(['--local', '--agent', 'claude-code', '--skill', c4Context], { cwd });
  assert.equal(skipped.targets[0].actions[0].status, 'skipped');
  assert.equal(fs.readFileSync(skillFile, 'utf8'), '# Local override\n');

  const updated = runJson([
    '--local',
    '--agent',
    'claude-code',
    '--skill',
    c4Context,
    '--yes',
  ], { cwd });
  assert.equal(updated.targets[0].actions[0].status, 'updated');
  assert.match(fs.readFileSync(skillFile, 'utf8'), /^---\nname: excalidash-c4-context/m);

  fs.writeFileSync(skillFile, '# Another local override\n', 'utf8');
  const forced = runJson(['--local', '--agent', 'claude-code', '--skill', c4Context, '--force'], { cwd });
  assert.equal(forced.targets[0].actions[0].status, 'overwritten');
  assert.match(fs.readFileSync(skillFile, 'utf8'), /^---\nname: excalidash-c4-context/m);
});

test('--json emits parseable diagnostics', (t) => {
  const cwd = temporaryDirectory(t);
  const result = run(['--doctor', '--local', '--json'], { cwd });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.operation, 'doctor');
  assert.equal(parsed.availableSkillCount, 25);
  assert.equal(parsed.targets.length, 2);
});

test('no arguments prints help without installing', (t) => {
  const cwd = temporaryDirectory(t);
  const result = run([], { cwd });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.equal(fs.existsSync(path.join(cwd, '.claude')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.agents')), false);
});

test('multiple targets fail with a clear JSON error', () => {
  const result = run(['--local', '--user', '--json']);
  assert.equal(result.status, 2);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Only one target/);
});
