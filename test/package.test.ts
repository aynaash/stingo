import { test, expect, describe } from 'bun:test';

/** The published manifest is easy to get wrong in ways nothing else catches:
 *  the repository resolves every path by accident, and `bun add <tarball>` is
 *  more forgiving than npm. These assert the things that only break for a
 *  stranger installing from the registry. */
const pkg = await Bun.file('packages/stingo/package.json').json();
const root = await Bun.file('package.json').json();

describe('published manifest', () => {
  test('bin paths do not start with "./"', () => {
    // npm 11 silently drops any bin entry whose value begins with "./" — the
    // command then does not exist for anyone who installed the package, and
    // the only clue is a warning buried in the publish log
    for (const [name, target] of Object.entries(pkg.bin as Record<string, string>)) {
      expect(target.startsWith('./'), `bin["${name}"] must not start with ./`).toBe(false);
    }
  });

  test('ships both the CLI and the MCP server', () => {
    expect(Object.keys(pkg.bin).sort()).toEqual(['stingo', 'stingo-mcp']);
  });

  test('every bin target exists', async () => {
    for (const target of Object.values(pkg.bin as Record<string, string>)) {
      expect(await Bun.file(`packages/stingo/${target}`).exists(), target).toBe(true);
    }
  });

  test('declares no workspace dependencies', () => {
    // @stingo/* packages are inlined by the bundler and never published, so a
    // dependency on one could never resolve for a consumer
    for (const [name, range] of Object.entries(pkg.dependencies as Record<string, string>)) {
      expect(range.startsWith('workspace:'), `${name} is a workspace dep`).toBe(false);
      expect(name.startsWith('@stingo/'), `${name} is unpublished`).toBe(false);
    }
  });

  test('every runtime dependency is pinned to the same range as the workspace', () => {
    for (const [name, range] of Object.entries(pkg.dependencies as Record<string, string>)) {
      const rootRange = (root.dependencies ?? {})[name] ?? (root.devDependencies ?? {})[name];
      if (rootRange) expect(range, name).toBe(rootRange);
    }
  });

  test('exports never point at unbundled source', () => {
    const paths: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') paths.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(pkg.exports);
    for (const p of paths) {
      expect(p.startsWith('./src/'), `${p} would import unpublished @stingo/* packages`).toBe(false);
    }
  });

  test('ships fonts, which the renderer cannot work without', () => {
    expect(pkg.files).toContain('assets');
  });
});
