#!/usr/bin/env bun
/** The `stingo` command.
 *
 *  From a checkout the workspace source is authoritative, so that editing a
 *  block changes the next render rather than the next build. From an installed
 *  package that source does not exist and only the bundle does. Preferring the
 *  bundle unconditionally would mean every local edit silently ran stale code. */
const src = new URL('../../cli/src/index.ts', import.meta.url);
if (await Bun.file(src).exists()) await import(src.href);
else await import('../dist/cli.js');
