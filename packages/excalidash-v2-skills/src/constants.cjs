'use strict';

const path = require('path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = require(path.join(PACKAGE_ROOT, 'package.json'));

module.exports = {
  MANIFEST_NAME: '.excalidash-v2-skills-manifest.json',
  PACKAGE_NAME: PACKAGE_JSON.name,
  PACKAGE_ROOT,
  PACKAGE_VERSION: PACKAGE_JSON.version,
  SHARED_DIR: '_shared',
};
