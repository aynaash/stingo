import { box, text, type El } from '@stingo/render';
import { interpolate, clamp } from '@stingo/core';
import type { BlockCtx } from './ctx';
import { typeStyle, fam } from './ctx';
import { T } from './stage';
import { lifecycle, enterP, animStyle } from './anim';
import { grainPattern } from './grain';

/** A small uppercase label with a leading accent rule. Used as a scene kicker. */
export function kicker(label: string, c: BlockCtx, delay = 0): El {
  const p = enterP(c.t, c.taste, delay);
  const { palette } = c.taste;
  return box({ alignItems: 'center', gap: c.stage.unit * 0.5, opacity: clamp(p) },
    box({ width: interpolate(p, [0, 1], [0, c.stage.unit * 1.7]), height: 3, background: palette.accent2, borderRadius: 2 }),
    text({ ...typeStyle(c, 'mono', T.kicker(c.stage), palette.accent2), textTransform: 'uppercase', letterSpacing: `${T.kicker(c.stage) * 0.18}px` }, label),
  );
}

/** Terminal-style window frame. The single strongest "dev channel" signal. */
export function windowFrame(c: BlockCtx, title: string, body: El, style: Record<string, any> = {}): El {
  const { palette, texture } = c.taste;
  const u = c.stage.unit;
  const dot = (col: string) => box({ width: u * 0.42, height: u * 0.42, borderRadius: u, background: col });
  return box({
    flexDirection: 'column', background: palette.surface, borderRadius: texture.cornerRadius,
    border: `2px solid ${palette.border}`, overflow: 'hidden', ...style,
  },
    box({ alignItems: 'center', gap: u * 0.42, padding: `${u * 0.55}px ${u * 0.75}px`, background: palette.surfaceAlt, borderBottom: `2px solid ${palette.border}` },
      dot(palette.danger), dot(palette.warn), dot(palette.ok),
      text({ ...typeStyle(c, 'mono', T.small(c.stage) * 0.92, palette.muted), marginLeft: u * 0.5 }, title),
    ),
    body,
  );
}

/** Thin progress bar pinned to the bottom — orients the viewer in a long video. */
export function progressBar(absT: number, total: number, c: BlockCtx): El {
  const { palette } = c.taste;
  const p = clamp(total > 0 ? absT / total : 0);
  return box({ position: 'absolute', bottom: 0, left: 0, width: c.stage.w, height: 6, background: palette.surfaceAlt },
    box({ width: Math.max(2, p * c.stage.w), height: 6, background: palette.accent }),
  );
}

/** Scene counter chip, e.g. "04 / 21". */
export function sceneChip(index: number, total: number, c: BlockCtx): El {
  const { palette } = c.taste;
  const u = c.stage.unit;
  const pad = (n: number) => String(n).padStart(2, '0');
  return box({ position: 'absolute', top: c.stage.padY * 0.42, right: c.stage.padX,
      padding: `${u * 0.3}px ${u * 0.6}px`, borderRadius: 999, border: `1.5px solid ${palette.border}`, background: palette.surface, opacity: 0.9 },
    text({ ...typeStyle(c, 'mono', T.small(c.stage) * 0.8, palette.muted) }, `${pad(index + 1)} / ${pad(total)}`),
  );
}

/** Textures (grain/vignette/scanlines) are applied to pixels after rasterising —
 *  see render/texture.ts. Nothing texture-related belongs in the SVG. */
export function textureLayer(_c: BlockCtx): { defs: string; infront: string } {
  return { defs: '', infront: '' };
}

/** Background grid drawn behind everything, independent of b-roll. */
export function gridLayer(c: BlockCtx): string {
  const { texture, palette } = c.taste;
  if (texture.grid <= 0) return '';
  const { w, h, unit } = c.stage;
  const step = unit * 2.4;
  const lines: string[] = [];
  for (let x = 0; x <= w; x += step) lines.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h}"/>`);
  for (let y = 0; y <= h; y += step) lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}"/>`);
  const col = palette.border;
  return `<g stroke="${col}" stroke-width="1" opacity="${texture.grid.toFixed(3)}">${lines.join('')}</g>`;
}
