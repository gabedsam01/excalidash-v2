'use strict';

// Recursive directory copy helper with zero runtime dependencies.

const fs = require('fs');
const path = require('path');

/**
 * Recursively copy a directory tree from `src` to `dest`.
 *
 * - Creates `dest` (and parents) if missing.
 * - Copies files, directories and symlinks.
 * - When `force` is false, throws if any destination *file* already exists.
 *   Existing directories are reused (merged into), never an error by themselves.
 * - When `force` is true, existing files are overwritten.
 *
 * @param {string} src  Absolute path to the source directory.
 * @param {string} dest Absolute path to the destination directory.
 * @param {{force?: boolean}} [opts]
 * @returns {number} The number of files copied.
 */
function copyDir(src, dest, opts) {
  const force = !!(opts && opts.force);

  const srcStat = fs.statSync(src);
  if (!srcStat.isDirectory()) {
    throw new Error(`copyDir: source is not a directory: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  let copied = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copied += copyDir(srcPath, destPath, { force });
    } else if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(srcPath);
      if (fs.existsSync(destPath) || isSymlink(destPath)) {
        if (!force) {
          throw new Error(`copyDir: refusing to overwrite existing path: ${destPath}`);
        }
        fs.rmSync(destPath, { force: true, recursive: true });
      }
      fs.symlinkSync(link, destPath);
      copied += 1;
    } else {
      // Regular file.
      if (fs.existsSync(destPath) && !force) {
        throw new Error(`copyDir: refusing to overwrite existing file: ${destPath}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      copied += 1;
    }
  }

  return copied;
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch (_err) {
    return false;
  }
}

module.exports = { copyDir };
