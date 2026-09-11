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
import { join, dirname, relative, sep } from 'node:path';
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
  // A render spawns this as a separate process, so it must exist as a real file
  // beside the CLI. Bundling the CLI alone leaves `stingo render` with nothing
  // to spawn — the published package renders zero frames.
  worker: 'packages/film/src/worker.ts',
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

// 2. the published README is the repository's, copied rather than maintained
//    twice — the npm copy had already drifted to an older block count
await Bun.write(`${PKG}/README.md`, Bun.file('README.md'));
console.log('  \x1b[32m✓\x1b[0m readme');

// 3. fonts travel with the package. The renderer needs real font files and
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

// 4. emit declarations
process.stdout.write('  types…');
const t1 = Date.now();
await run(['node_modules/.bin/tsc', '-p', 'tsconfig.build.json'], 'tsc');
console.log(`\r  \x1b[32m✓\x1b[0m types     in ${Date.now() - t1}ms`);

// 5. rewrite the workspace aliases tsc preserved in the declarations
//
//    tsc emits `from '@stingo/schema'` because that is what the source says and
//    the monorepo tsconfig maps it. A consumer has no @stingo/* packages — they
//    are inlined into the bundle — so every one of those specifiers resolves to
//    nothing. With skipLibCheck off that is a wall of errors; with it on, which
//    is the tsc --init default, the whole API silently degrades to `any`, which
//    is worse. typesVersions cannot help: it maps a package's own subpaths, not
//    bare specifiers. So the imports are rewritten to relative paths inside the
//    shipped types tree.
process.stdout.write('  type paths…');
const tp = Date.now();
const typeRoot = join(OUT, 'types');
let rewritten = 0;
const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (e.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
};
for (const file of await walk(typeRoot)) {
  const src = await Bun.file(file).text();
  const fixed = src.replace(/(['"])@stingo\/([a-z-]+)((?:\/[A-Za-z0-9_.-]+)*)\1/g, (_m, q, pkg, rest) => {
    const target = join(typeRoot, pkg, rest ? rest.replace(/^\//, '') : 'src/index');
    let rel = relative(dirname(file), target).split(sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return q + rel + q;
  });
  if (fixed !== src) { await Bun.write(file, fixed); rewritten++; }
}
// The public API exposes Buffer (framePixels, framePng, blendUnder), so the
// declarations name it. Automatic @types inclusion does not reach a dependency's
// .d.ts reliably, and a consumer on a default tsconfig then gets "Cannot find
// name 'Buffer'". A reference directive in the entry pulls node's globals in
// whatever the consumer configured.
for (const entry of ['stingo/src/index.d.ts', 'stingo/src/media.d.ts']) {
  const f = join(typeRoot, entry);
  if (!(await Bun.file(f).exists())) continue;
  const body = await Bun.file(f).text();
  if (!body.startsWith('/// <reference types="node"')) {
    await Bun.write(f, `/// <reference types="node" />\n${body}`);
  }
}
console.log(`\r  \x1b[32m✓\x1b[0m type paths ${rewritten} files in ${Date.now() - tp}ms`);

// 6. report
const files = await readdir(OUT, { recursive: true } as any);
console.log(`\n  ${OUT}/`);
for (const f of (files as string[]).filter((f) => !f.includes('/')).sort()) {
  const s = Bun.file(join(OUT, f)).size;
  if (s) console.log(`    ${f.padEnd(28)} ${(s / 1024).toFixed(1)} KB`);
}
console.log('\n  \x1b[2mnext: cd packages/stingo && npm pack --dry-run\x1b[0m\n');
