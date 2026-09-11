# Releasing

Nothing is on npm yet. Today stingo is used from a clone, and the documentation
says so deliberately — "runs from a clone today" — so that publishing changes a
few lines rather than a narrative.

This is the path when that happens.

## Before publishing: one thing is missing

**The `stingo` package does not ship the MCP server.** Its `bin` has only
`stingo`, and `@stingo/mcp` is not among its dependencies. Publishing as-is
would put the CLI on npm but leave `bunx stingo-mcp` — the one command that
matters for the "connect an AI" path — not working.

Fix before the first publish, in `packages/stingo/package.json`:

```jsonc
"bin": {
  "stingo": "./bin/stingo.ts",
  "stingo-mcp": "./bin/stingo-mcp.ts"     // add
},
"dependencies": {
  "@modelcontextprotocol/sdk": "^1.30.0", // add — the MCP server needs it
  // ...
}
```

with `packages/stingo/bin/stingo-mcp.ts`:

```ts
#!/usr/bin/env bun
import { main } from '@stingo/mcp';
await main();
```

and `@stingo/mcp` either listed as a dependency or bundled by `tools/build.ts`
the way the other packages are.

**Also check the workspace dependencies.** `packages/stingo/package.json` lists
eleven `@stingo/*` packages as `workspace:*`. None of them are published. Either
`tools/build.ts` bundles them all into `dist/` and they come out of
`dependencies` entirely, or all eleven get published alongside. Verify with a
packed tarball before pushing anything to the registry — see below.

## Checks

```bash
bun test
bun run typecheck
bun run docs:build
```

CI runs the first two on Linux and macOS. Do not release on red.

## Verify the tarball before the registry sees it

This is the step that catches a broken publish, and it costs a minute:

```bash
cd packages/stingo
npm pack --dry-run          # what would ship
npm pack                    # produces stingo-<version>.tgz

# install it somewhere that is not this repository
cd $(mktemp -d)
bun add /path/to/stingo-<version>.tgz
bunx stingo tastes          # the CLI resolves
bunx stingo-mcp < /dev/null # the MCP server starts and exits cleanly
```

If anything reaches for a `workspace:*` dependency here, it will fail in exactly
the way it would fail for a stranger.

## Publish

```bash
cd packages/stingo
npm publish --access public
```

`prepublishOnly` runs `tools/build.ts` first, so `dist/` is built from the
current source rather than whatever was there last.

## After publishing

1. **Tag and release.** `gh release create vX.Y.Z --title ... --notes ...`,
   attaching the 720p example films as before.
2. **Update the install instructions** in three places, all of which currently
   say "runs from a clone today":
   - `README.md`, the "Let your AI make it" section
   - `docs/content/mcp.md`, the "Connect it" section
   - `docs/landing.ts`, the `mcpConfig` block and the paragraph above it

   They become:

   ```json
   {
     "mcpServers": {
       "stingo": { "command": "bunx", "args": ["--bun", "stingo-mcp"] }
     }
   }
   ```

3. **Rebuild the docs** — the Pages workflow does this on push.

## Versioning

Pre-1.0, so the middle number carries breaking changes. The schema is the part
people depend on: adding a block or an optional field is a patch, changing what
an existing field means is not.

1.0 is not a date. It is when the schema has been stable long enough that
changing it would be rude — see [ROADMAP.md](./ROADMAP.md).
