#!/usr/bin/env bun
/** The `stingo` command. Runs the bundled CLI, so the published package does
 *  not depend on workspace sources that are not published with it. */
import '../dist/cli.js';
