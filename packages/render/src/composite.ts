/** Satori is excellent at layout and text but cannot express arbitrary SVG.
 *  So we render layout with satori, draw procedural graphics by hand, and
 *  splice both into one SVG document that resvg rasterizes in a single pass. */

const OPEN_TAG = /^(<svg[^>]*>)/;

export interface Layers {
  defs?: string;
  behind?: string;
  infront?: string;
  /** Punch a hole through the lower layers, so pixels composited underneath
   *  the rasterised frame show through it — how a camera take is placed.
   *  `body` decides whether satori's output is cut too, which is what sets the
   *  take's z-order: a corner inset sits over block content, a full-frame take
   *  sits under it. */
  mask?: { id: string; body: boolean };
}

export function composite(satoriSvg: string, layers: Layers): string {
  const m = OPEN_TAG.exec(satoriSvg);
  if (!m) throw new Error('composite: could not find <svg> opening tag in satori output');
  const open = m[1]!;
  const body = satoriSvg.slice(open.length, satoriSvg.lastIndexOf('</svg>'));
  const mask = layers.mask;
  const wrap = (content: string, on: boolean) =>
    !content ? '' : on && mask ? `<g mask="url(#${mask.id})">${content}</g>` : content;

  return [
    open,
    layers.defs ? `<defs>${layers.defs}</defs>` : '',
    wrap(layers.behind ?? '', !!mask),
    wrap(body, !!mask && mask.body),
    layers.infront ?? '',
    '</svg>',
  ].join('');
}
