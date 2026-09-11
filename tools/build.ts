#!/usr/bin/env bun
/** Build the publishable package.
 *
 *  Bun runs TypeScript directly, so the source is already usable here — but a
 *  consumer installing from a registry wants compiled ESM and .d.ts files.
 *  This bundles the workspace into one entry point and emits declarations.
 *
 *  Target is `bun`, not `node`, and that is a deliberate constraint rather than
 *  an oversight: the pipeline drives ffmpeg through `Bun.spawn` and reads files
 *  through `Bun.file`, so it needs the Bun runtime. `engines.bun` says so.
 *  Supporting Node would mean abstracting process spawning and file IO behind
 *  an adapter — worth doing if anyone asks, not worth pretending we already did.
 *
 *  Runtime dependencies stay external: satori, resvg and shiki are large, and
 *  resvg ships a native binary that must not be inlined. */
import { rm, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'bun';

const PKG = 'packages/stingo';
const OUT = `${PKG}/dist`;

/** Three entry points, because a published package has three jobs: be a
 *  library, be the `stingo` command, and be the `stingo-mcp` server. Each is
 *  bundled separately so the CLI's top-level side effects never run just
 *  because someone imported the library. */
const ENTRIES = {
  index: `${PKG}/src/index.ts`,
  cli: 'packages/cli/src/index.ts',
  mcp: 'packages/mcp/src/index.ts',
};

/** Everything @stingo/* is inlined — none of those packages are published, so
 *  a dependency on one could never resolve for a consumer. What stays external
 *  is exactly what package.json declares as a dependency. */
const EXTERNAL = ['satori', '@resvg/resvg-js', 'shiki', 'zod', 'yaml', 'd3-shape', 'd3-scale',
  '@modelcontextprotocol/sdk'];

const run = async (cmd: string[], label: string) => {
  const p = spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = [await new Response(p.stdout).text(), await new Response(p.stderr).text()];
  const code = await p.exited;
  if (code !== 0) throw new Error(`${label} failed (exit ${code})\n${err || out}`);
  return out;
};

console.log('\x1b[1m\x1b[35mstingo\x1b[0m build\n');
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. bundle to ESM
process.stdout.write('  bundling…');
const t0 = Date.now();
// every entry file is called index.ts, so they are built one at a time with
// an explicit output name rather than fighting the naming template
let bundled = 0;
for (const [name, entry] of Object.entries(ENTRIES)) {
  const res = await Bun.build({
    entrypoints: [entry],
    outdir: OUT,
    naming: { entry: `${name}.js` },
    target: 'bun',
    format: 'esm',
    external: EXTERNAL,
    minify: false,        // a library ships readable stack traces
    sourcemap: 'linked',
  });
  if (!res.success) {
    console.log('\n');
    for (const l of res.logs) console.error(l);
    process.exit(1);
  }
  bundled += res.outputs.reduce((a, o) => a + o.size, 0);
}
console.log(`\r  \x1b[32m✓\x1b[0m bundled   ${(bundled / 1024).toFixed(0)} KB in ${Date.now() - t0}ms`);

// 2. fonts travel with the package. The renderer needs real font files and
//    cannot rely on whatever directory a consumer happens to be standing in.
process.stdout.write('  fonts…');
const tf = Date.now();
await rm(`${PKG}/assets`, { recursive: true, force: true });
await mkdir(`${PKG}/assets/fonts`, { recursive: true });
let fontBytes = 0;
for (const f of await readdir('assets/fonts')) {
  if (!/\.(ttf|otf)$/i.test(f)) continue;
  const src = Bun.file(join('assets/fonts', f));
  fontBytes += src.size;
  await Bun.write(join(PKG, 'assets/fonts', f), src);
}
console.log(`\r  \x1b[32m✓\x1b[0m fonts     ${(fontBytes / 1024 / 1024).toFixed(1)} MB in ${Date.now() - tf}ms`);

// 3. emit declarations
process.stdout.write('  types…');
const t1 = Date.now();
await run(['node_modules/.bin/tsc', '-p', 'tsconfig.build.json'], 'tsc');
console.log(`\r  \x1b[32m✓\x1b[0m types     in ${Date.now() - t1}ms`);

// 4. report
const files = await readdir(OUT, { recursive: true } as any);
console.log(`\n  ${OUT}/`);
for (const f of (files as string[]).filter((f) => !f.includes('/')).sort()) {
  const s = Bun.file(join(OUT, f)).size;
  if (s) console.log(`    ${f.padEnd(28)} ${(s / 1024).toFixed(1)} KB`);
}
console.log('\n  \x1b[2mnext: cd packages/stingo && npm pack --dry-run\x1b[0m\n');
