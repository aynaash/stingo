#!/usr/bin/env bun
/** Generate the block reference in the docs from the registry.
 *
 *  Written by hand, fourteen field tables drift the first time anyone adds an
 *  option and forgets the markdown. Generated from the same `defineBlock` calls
 *  the renderer uses, they cannot. The YAML example beside each block is the
 *  literal scene that produced the screenshot above it, so the three can never
 *  disagree either.
 *
 *    bun run tools/blockdocs.ts            rewrite the generated section
 *    bun run tools/blockdocs.ts --check    fail if it is out of date (for CI)
 */
import '@stingo/blocks';
import { allBlocks, getBlock } from '@stingo/schema';
import { BLOCK_SHOTS } from './shots';
import { Document, visit, isSeq, isScalar } from 'yaml';

const BEGIN = '<!-- generated: blocks — bun run tools/blockdocs.ts -->';
const END = '<!-- /generated -->';
const PAGE = 'docs/content/blocks.md';

/** Short sequences of scalars read far better inline: `at: [0, 1]` rather than
 *  four lines of block sequence. */
function toYaml(value: unknown): string {
  const doc = new Document(value);
  visit(doc, {
    Seq(_key, node) {
      if (node.items.every((i: any) => isScalar(i)) && node.items.length <= 4) {
        const width = node.items.reduce((a: number, i: any) => a + String(i.value).length + 2, 0);
        if (width <= 40) (node as any).flow = true;
      }
    },
  });
  return doc.toString({ lineWidth: 76 }).trimEnd();
}

/** One level into a container, so `array` becomes `array of {id, label, at…}`. */
function inner(schema: any): string {
  const d = schema?._zod?.def;
  if (!d) return '';
  if (d.type === 'array') {
    const el = d.element?._zod?.def;
    if (el?.type === 'object') return ` of \`{ ${Object.keys(el.shape ?? {}).join(', ')} }\``;
    if (el?.type) return ` of \`${el.type}\``;
  }
  if (d.type === 'object') return ` \`{ ${Object.keys(d.shape ?? {}).join(', ')} }\``;
  if (d.type === 'tuple') return ` \`[${(d.items ?? []).map((i: any) => i?._zod?.def?.type ?? '?').join(', ')}]\``;
  return '';
}

/** Describe a zod field the way someone writing YAML needs to see it. */
function describeField(schema: any): { type: string; required: boolean; def?: string } {
  let z = schema, required = true, def: string | undefined;

  // unwrap the modifier chain: .default() and .optional() both wrap the real type
  for (let guard = 0; guard < 8; guard++) {
    const d = z?._zod?.def;
    if (!d) break;
    if (d.type === 'default' || d.type === 'prefault') {
      const v = typeof d.defaultValue === 'function' ? d.defaultValue() : d.defaultValue;
      def = JSON.stringify(v);
      required = false;
      z = d.innerType;
    } else if (d.type === 'optional' || d.type === 'nullable') {
      required = false;
      z = d.innerType;
    } else break;
  }

  const d = z?._zod?.def;
  const kind = d?.type ?? 'unknown';
  let type: string;
  if (kind === 'enum') type = Object.keys(d.entries ?? {}).map((e) => `\`${e}\``).join(' \\| ');
  else if (kind === 'array' || kind === 'object' || kind === 'tuple') type = kind + inner(z);
  else type = `\`${kind}\``;

  return { type, required, def };
}

function section(name: string): string {
  const d = getBlock(name);
  if (!d) return '';
  const rows = Object.entries(d.fields as Record<string, any>).map(([k, v]) => {
    const f = describeField(v);
    return `| \`${k}\` | ${f.type} | ${f.required ? '**yes**' : f.def !== undefined ? `\`${f.def}\`` : '—'} |`;
  });

  const shot = BLOCK_SHOTS[name];
  let example = '';
  if (shot) {
    // the exact scene that rendered the picture above
    const { block, ...rest } = shot.scene as Record<string, any>;
    example = '\n```yaml\n' + toYaml({ scenes: [{ block, ...rest }] }) + '\n```\n';
  }

  const dur = d.duration;
  const timing = `${dur.base}s by default`
    + (dur.estimate ? ', longer as the content grows' : '')
    + (dur.exact ? ', and exempt from the pacing clamp' : '');

  return [
    `### ${name}`,
    '',
    d.describe ?? '',
    '',
    `<figure class="wide"><img src="../assets/img/block-${name}.webp" width="520" height="924" loading="lazy" decoding="async" alt="${d.describe ?? name}"></figure>`,
    '',
    '| field | type | default |',
    '|---|---|---|',
    ...rows,
    '',
    `${timing}. Background defaults to \`${d.broll?.kind ?? 'grid'}\`.`,
    example,
  ].join('\n');
}

const ordered = ['title', 'statement', 'code', 'terminal', 'diagram', 'chart', 'stat',
                 'list', 'compare', 'quote', 'image', 'broll', 'camera', 'outro'];
const names = [...ordered.filter((n) => getBlock(n)), ...allBlocks().map((b) => b.name).filter((n) => !ordered.includes(n))];

const generated = [
  BEGIN,
  '',
  ...names.map(section),
  END,
].join('\n');

const page = await Bun.file(PAGE).text();
const start = page.indexOf(BEGIN);
const end = page.indexOf(END);
if (start === -1 || end === -1) {
  console.error(`${PAGE} has no generated section — add these two lines where the reference should go:\n\n${BEGIN}\n${END}\n`);
  process.exit(1);
}
const next = page.slice(0, start) + generated + page.slice(end + END.length);

if (process.argv.includes('--check')) {
  if (next !== page) {
    console.error('\x1b[31m✗\x1b[0m the block reference in the docs is out of date — run: bun run tools/blockdocs.ts');
    process.exit(1);
  }
  console.log('\x1b[32m✓\x1b[0m the block reference matches the registry');
} else {
  await Bun.write(PAGE, next);
  console.log(`\x1b[32m✓\x1b[0m ${PAGE} — ${names.length} blocks documented from the registry`);
}
