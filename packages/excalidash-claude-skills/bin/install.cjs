#!/usr/bin/env node
'use strict';

// Entry point for the @excalidash/claude-skills installer.
// Delegates all argument parsing and behaviour to ../src/cli.cjs.

require('../src/cli.cjs').main(process.argv.slice(2));
