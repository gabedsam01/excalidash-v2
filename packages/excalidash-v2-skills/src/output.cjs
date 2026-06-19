'use strict';

function printResult(result, options = {}) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const formatter = FORMATTERS[result.operation] || formatGeneric;
  const lines = formatter(result);
  const stream = result.ok === false ? process.stderr : process.stdout;
  stream.write(`${lines.join('\n')}\n`);
}

function printError(error, options = {}) {
  const result = {
    ok: false,
    operation: 'error',
    error: error.message,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stderr.write(`Error: ${error.message}\n`);
  }
}

const FORMATTERS = {
  list(result) {
    return [
      `Available ExcaliDash V2 skills (${result.skillCount}):`,
      ...result.skills.map((skill) => `- ${skill.name}${skill.description ? ` — ${skill.description}` : ''}`),
    ];
  },
  verify(result) {
    const lines = [];
    for (const report of result.reports) {
      lines.push(`${report.ok ? 'OK' : 'FAILED'}: ${report.targetDir || report.sourceDir}`);
      lines.push(`  Skills checked: ${report.skills.length}`);
      for (const problem of report.problems) lines.push(`  - ${problem}`);
    }
    if (result.ok) lines.push('Verification passed.');
    return lines;
  },
  install(result) {
    const lines = [result.dryRun ? 'Installation dry run:' : 'Installation complete:'];
    for (const target of result.targets) {
      lines.push(`- ${target.targetDir} (${target.agent})`);
      for (const action of target.actions) {
        lines.push(`  ${action.status}: ${action.name}${action.reason ? ` — ${action.reason}` : ''}`);
      }
    }
    return lines;
  },
  uninstall(result) {
    const lines = [result.dryRun ? 'Uninstall dry run:' : 'Uninstall complete:'];
    for (const target of result.targets) {
      lines.push(`- ${target.targetDir}`);
      for (const action of target.actions) {
        lines.push(`  ${action.status}: ${action.name}${action.reason ? ` — ${action.reason}` : ''}`);
      }
    }
    return lines;
  },
  doctor(result) {
    const lines = [
      `Node version: ${result.nodeVersion}`,
      `Package version: ${result.packageVersion}`,
      `Available skills: ${result.availableSkillCount}`,
      `Source: ${result.sourceDir}`,
    ];
    for (const target of result.targets) {
      lines.push(`Target: ${target.targetDir}`);
      lines.push(`  Agent: ${target.agent}`);
      lines.push(`  Writable: ${target.writable ? 'yes' : 'no'}`);
      lines.push(`  Installed skills: ${target.installedSkills.length}`);
      if (target.problems.length > 0) {
        for (const problem of target.problems) lines.push(`  - ${problem}`);
      }
    }
    if (result.problems.length > 0) {
      lines.push('Problems:');
      for (const problem of result.problems) lines.push(`- ${problem}`);
    } else {
      lines.push('Problems: none');
    }
    return lines;
  },
  help(result) {
    return result.text.split('\n');
  },
  version(result) {
    return [result.version];
  },
};

function formatGeneric(result) {
  return [JSON.stringify(result, null, 2)];
}

module.exports = { printError, printResult };
