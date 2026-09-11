import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface LoadedFont { name: string; data: ArrayBuffer; weight: 100|200|300|400|500|600|700|800|900; style: 'normal'|'italic' }

const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, regular: 400, normal: 400, book: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, black: 900,
};

/** Families whose camelCase cannot be split correctly by rule. */
const ALIASES: Record<string, string> = {
  jetbrainsmono: 'JetBrains Mono', interdisplay: 'Inter Display', inter: 'Inter',
  sourcecodepro: 'Source Code Pro', ibmplexmono: 'IBM Plex Mono', firacode: 'Fira Code',
};
export const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

/** Infer family/weight/style from a filename like "JetBrainsMonoNerdFont-ExtraBold.ttf". */
function inferFace(file: string): { family: string; weight: number; style: 'normal'|'italic' } | null {
  const base = file.replace(/\.(ttf|otf|woff)$/i, '');
  if (base !== file.replace(/\.[^.]+$/, '')) { /* had a valid ext */ } else if (!/\.(ttf|otf|woff)$/i.test(file)) return null;
  const [rawFamily, rawStyle = 'Regular'] = base.split('-');
  const style = /italic|oblique/i.test(rawStyle) ? 'italic' as const : 'normal' as const;
  const key = rawStyle.toLowerCase().replace(/italic|oblique/g, '') || 'regular';
  const cleaned = (rawFamily ?? base).replace(/NerdFont(Propo|Mono)?|NL/g, '').trim();
  const family = ALIASES[norm(cleaned)] ?? cleaned.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return { family, weight: WEIGHTS[key] ?? 400, style };
}

/** Variable fonts break satori's opentype parser (fvar table), so they are skipped. */
function isVariable(buf: ArrayBuffer): boolean {
  const dv = new DataView(buf);
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    if (off + 4 > buf.byteLength) break;
    const tag = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    if (tag === 'fvar') return true;
  }
  return false;
}

export async function loadFonts(dir: string): Promise<LoadedFont[]> {
  const out: LoadedFont[] = [];
  const skipped: string[] = [];
  for (const file of await readdir(dir)) {
    if (!/\.(ttf|otf|woff)$/i.test(file)) continue;
    const face = inferFace(file);
    if (!face) continue;
    const data = await Bun.file(join(dir, file)).arrayBuffer();
    if (isVariable(data)) { skipped.push(file); continue; }
    out.push({ name: face.family, data, weight: face.weight as LoadedFont['weight'], style: face.style });
  }
  if (skipped.length) console.warn(`[fonts] skipped ${skipped.length} variable font(s): ${skipped.join(', ')}`);
  if (!out.length) throw new Error(`no usable static fonts in ${dir}`);
  return out;
}

export const familiesOf = (fonts: LoadedFont[]) => [...new Set(fonts.map((f) => f.name))];

/** Forgiving family lookup: "jetbrains mono" and "JetBrainsMono" both resolve. */
export function resolveFamily(fonts: LoadedFont[], requested: string): string {
  const want = norm(requested);
  const hit = fonts.find((f) => norm(f.name) === want);
  if (hit) return hit.name;
  const partial = fonts.find((f) => norm(f.name).includes(want) || want.includes(norm(f.name)));
  if (partial) return partial.name;
  const fallback = fonts[0]!.name;
  console.warn(`[fonts] family "${requested}" not found, falling back to "${fallback}"`);
  return fallback;
}
