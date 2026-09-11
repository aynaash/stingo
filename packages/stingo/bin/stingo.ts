#!/usr/bin/env bun
/** The `stingo` command.
 *
 *  From a checkout the workspace source is authoritative, so that editing a
 *  block changes the next render rather than the next build. From an installed
 *  package that source does not exist and only the bundle does. Preferring the
 *  bundle unconditionally would mean every local edit silently ran stale code. */
// Only trust the workspace source when this really is a checkout: from an
// installed package the same relative path points at node_modules/cli, which
// is some unrelated package, and importing it would execute a stranger's code.
const src = new URL('../../cli/src/index.ts', import.meta.url);
const inCheckout = await Bun.file(new URL('../../cli/package.json', import.meta.url)).exists()
  && JSON.parse(await Bun.file(new URL('../../cli/package.json', import.meta.url)).text()).name === '@stingo/cli';
if (inCheckout && await Bun.file(src).exists()) await import(src.href);
else await import('../dist/cli.js');
