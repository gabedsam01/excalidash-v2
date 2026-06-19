'use strict';

const fs = require('fs');
const path = require('path');

function replaceDirectory(sourceDir, targetDir) {
  const sourceStat = fs.statSync(sourceDir);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Copy source is not a directory: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { force: true, recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  return copyEntries(sourceDir, targetDir);
}

function copyEntries(sourceDir, targetDir) {
  let copiedFiles = 0;
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const stat = fs.lstatSync(sourcePath);

    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to copy symbolic link: ${sourcePath}`);
    }
    if (stat.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      copiedFiles += copyEntries(sourcePath, targetPath);
    } else if (stat.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
      fs.chmodSync(targetPath, stat.mode);
      copiedFiles += 1;
    } else {
      throw new Error(`Unsupported filesystem entry: ${sourcePath}`);
    }
  }

  return copiedFiles;
}

module.exports = { replaceDirectory };
