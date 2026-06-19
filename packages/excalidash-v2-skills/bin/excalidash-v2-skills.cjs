#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli.cjs');

process.exitCode = main(process.argv.slice(2));
