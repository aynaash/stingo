#!/usr/bin/env bun
/** The MCP server over stdio. Source from a checkout, bundle when installed —
 *  see bin/stingo.ts for why. */
// Only trust the workspace source when this really is a checkout: from an
// installed package the same relative path points at node_modules/mcp, which
// is some unrelated package, and importing it would execute a stranger's code.
const src = new URL('../../mcp/src/index.ts', import.meta.url);
const inCheckout = await Bun.file(new URL('../../mcp/package.json', import.meta.url)).exists()
  && JSON.parse(await Bun.file(new URL('../../mcp/package.json', import.meta.url)).text()).name === '@stingo/mcp';
const mod = inCheckout && await Bun.file(src).exists()
  ? await import(src.href)
  : await import('../dist/mcp.js');
await mod.main();
