/** Minimal element factory. Satori consumes React-shaped nodes but needs no React. */
export interface El { type: string; props: Record<string, any> & { children?: any } }
export type Child = El | string | number | null | undefined | false | Child[];

type Rendered = El | string | number;

/** Array.prototype.flat(Infinity) over a recursive element type makes
 *  TypeScript give up ("type instantiation is excessively deep"), so the
 *  flatten is explicit. It also drops the falsy branches in one pass, which
 *  is what lets `cond && el` and `list.map(...)` be written inline. */
function flatten(kids: Child[], out: Rendered[] = []): Rendered[] {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) flatten(k, out);
    else out.push(k);
  }
  return out;
}

export function h(type: string, props: Record<string, any> | null, ...kids: Child[]): El {
  const flat = flatten(kids);
  return { type, props: { ...(props ?? {}), children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat } };
}

/** satori requires display:flex on any element with multiple children; this enforces it. */
export const box = (style: Record<string, any>, ...kids: Child[]) => h('div', { style: { display: 'flex', ...style } }, ...kids);
export const text = (style: Record<string, any>, content: string | number) => h('div', { style: { display: 'flex', ...style } }, String(content));
export const abs = (style: Record<string, any>, ...kids: Child[]) => box({ position: 'absolute', ...style }, ...kids);
