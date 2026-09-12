# Releasing

Nothing is on npm yet. Today stingo is used from a clone, and the documentation
says so deliberately — "runs from a clone today" — so that publishing changes a
few lines rather than a narrative.

This is the path when that happens.

## The package is scoped, and the reason matters

npm refuses the name `stingo`:

```
403 Package name too similar to existing package string;
try renaming your package to '@hersidev/stingo'
```

That is npm's typosquatting guard — `stingo` is two edits from `string`. It
cannot be argued with from the CLI, so the library publishes as
**`@hersidev/stingo`** while the binaries stay `stingo` and `stingo-mcp`, and
every other surface — the repository, the docs, the name itself — is unchanged.

One consequence worth remembering: `bunx` resolves a *package* name, so
`bunx stingo-mcp` does not work. The MCP config needs the package spelled out:

```json
{ "command": "bunx", "args": ["--bun", "--package=@hersidev/stingo", "stingo-mcp"] }
```

Scoped packages are private by default, hence `publishConfig.access: public`
in the manifest.

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
npm pack                       # produces stingo-<version>.tgz

cd $(mktemp -d)
echo '{"name":"c","private":true}' > package.json
npm install /path/to/stingo-<version>.tgz   # npm, NOT bun — see the trap above

ls node_modules/.bin/          # both stingo and stingo-mcp must be here
./node_modules/.bin/stingo tastes
./node_modules/.bin/stingo still video.yaml --at 1 -o f.png   # fonts resolve
./node_modules/.bin/stingo render video.yaml --draft -o v.mp4 # WORKERS SPAWN
```

**Render, not just `still`.** They fail differently and only one of them was
caught in testing. A still runs in-process; a render spawns worker processes by
file path, and the bundle has no `worker.ts` next to it. If `render` is skipped,
a package ships where every full render dies and only single frames work.

If anything reaches for a `workspace:*` dependency here, it fails in exactly the
way it would fail for a stranger.

## Publish

The account has 2FA enforced for publishing, so an OTP is required:

```bash
cd packages/stingo
npm publish --otp=123456        # six digits from your authenticator
```

Without it npm returns `E403 ... Two-factor authentication or granular access
token with bypass 2fa enabled is required`. The alternative is a granular access
token with "bypass 2FA" enabled, which is worth setting up only for CI.

**Publish from a commit, not from a dirty working tree.** `prepublishOnly`
bundles whatever is on disk, so uncommitted work ends up in the tarball and the
published version corresponds to nothing in the history. Check `git status`
first; if it is not clean, commit or stash before publishing.

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
