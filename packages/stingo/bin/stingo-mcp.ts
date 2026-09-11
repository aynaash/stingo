#!/usr/bin/env bun
/** The MCP server over stdio, so `bunx stingo-mcp` works after install. */
import { main } from '../dist/mcp.js';
await main();
