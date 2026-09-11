#!/usr/bin/env bun
/** The MCP server over stdio. Source from a checkout, bundle when installed —
 *  see bin/stingo.ts for why. */
const src = new URL('../../mcp/src/index.ts', import.meta.url);
const mod = await Bun.file(src).exists()
  ? await import(src.href)
  : await import('../dist/mcp.js');
await mod.main();
