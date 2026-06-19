#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { PACKAGE_ROOT } = require('./constants.cjs');
const { verifySource } = require('./verify.cjs');

const generatedRoot = path.join(PACKAGE_ROOT, 'skills');
const generatedSkills = path.join(generatedRoot, 'excalidash');
const generatedLicense = path.join(PACKAGE_ROOT, 'LICENSE');
const repositorySkills = path.resolve(PACKAGE_ROOT, '..', '..', 'skills', 'excalidash');
const repositoryLicense = path.resolve(PACKAGE_ROOT, '..', '..', 'LICENSE');
const marker = path.join(PACKAGE_ROOT, '.excalidash-v2-skills-prepack');

function prepare() {
  if (!fs.existsSync(repositorySkills)) {
    throw new Error(`Repository skills directory not found: ${repositorySkills}`);
  }
  if (!fs.existsSync(repositoryLicense)) {
    throw new Error(`Repository license not found: ${repositoryLicense}`);
  }
  const verification = verifySource(repositorySkills, []);
  if (!verification.ok) {
    throw new Error(`Skills verification failed:\n${verification.problems.join('\n')}`);
  }
  clean();
  fs.writeFileSync(marker, 'generated\n', 'utf8');
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.cpSync(repositorySkills, generatedSkills, { recursive: true, dereference: false });
  fs.copyFileSync(repositoryLicense, generatedLicense);
}

function clean() {
  const marked = fs.existsSync(marker);
  if ((fs.existsSync(generatedRoot) || fs.existsSync(generatedLicense)) && !marked) {
    throw new Error(`Refusing to remove unmarked generated package files in ${PACKAGE_ROOT}`);
  }
  if (marked) {
    fs.rmSync(generatedRoot, { force: true, recursive: true });
    fs.rmSync(generatedLicense, { force: true });
  }
  fs.rmSync(marker, { force: true });
}

const command = process.argv[2];
if (command === 'prepare') prepare();
else if (command === 'clean') clean();
else throw new Error('Usage: node src/pack.cjs prepare|clean');
