# Releasing

Nothing is on npm yet. Today stingo is used from a clone, and the documentation
says so deliberately — "runs from a clone today" — so that publishing changes a
few lines rather than a narrative.

This is the path when that happens.

## A trap worth knowing about

**npm silently drops bin entries whose value starts with `./`.** Not an error —
a warning in the publish log, and then the command does not exist for anyone who
installs the package:

```
npm warn publish "bin[stingo]" script name bin/stingo.ts was invalid and removed
```

`bun add <tarball>` does not reproduce it, because bun does not apply npm's
manifest rewriting. So the only way to catch it is to install the packed tarball
**with npm** and look in `node_modules/.bin`. `test/package.test.ts` now asserts
the shape of the manifest, but check the log anyway.

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
