import type { VideoDoc, TasteProfile } from '@stingo/schema';
import type { BeatGrid } from '@stingo/core';
import { Film } from './film';
import type { ClipTable } from './plan';

/** A contact sheet: one still per scene, laid out in a grid.
 *
 *  Nobody can hold a six-minute video in their head, and scrubbing is a serial
 *  act — you see one moment at a time and have to remember the rest. Twelve
 *  frames side by side is a different kind of looking: it is how you notice
 *  that three scenes in a row are dark, that two of them say almost the same
 *  thing, or that the one bright scene is in the wrong place.
 *
 *  It is the cheapest review pass there is. Every frame it needs is already
 *  renderable, and the whole sheet costs what a dozen stills cost. */

export interface SheetOpts {
  doc: VideoDoc;
  taste: TasteProfile;
  grid?: BeatGrid;
  clips?: ClipTable;
  noCamera?: boolean;
  /** total sheet width in pixels */
  width?: number;
  /** columns; chosen from the scene count and frame shape when omitted */
  cols?: number;
  /** where in each scene to sample, 0..1 */
  at?: number;
  /** called after each scene is rendered, for a progress line */
  onFrame?: (done: number, total: number) => void;
}

export interface SheetResult { png: Buffer; width: number; height: number; cols: number; rows: number; cells: number }

/** How wide a thumbnail has to be before you can actually judge it. Portrait
 *  cells are narrower because the same width buys far more height. */
const TARGET_CELL = { portrait: 340, other: 460 } as const;

/** Columns that keep each thumbnail big enough to read.
 *
 *  Fitting the grid to a page aspect is the wrong target, because a contact
 *  sheet is scrolled rather than framed. Optimising for a 16:10 page turned a
 *  53-scene portrait film into thirteen columns of 170px stills — a mosaic, not
 *  a review. Thumbnail size is the constraint that matters; the sheet is as
 *  tall as it needs to be. */
export function sheetColumns(count: number, frameAspect: number, sheetWidth = 2000): number {
  const target = frameAspect < 1 ? TARGET_CELL.portrait : TARGET_CELL.other;
  return Math.max(1, Math.min(count, Math.floor(sheetWidth / target) || 1));
}

export async function contactSheet(opts: SheetOpts): Promise<SheetResult> {
  const { doc, taste } = opts;
  const film = await Film.create({
    doc, taste, grid: opts.grid, clips: opts.clips, noCamera: opts.noCamera,
    // the HUD's progress bar and scene counter are noise at thumbnail size, and
    // the sheet carries the same information in its labels
    hud: false,
  });

  try {
    const cues = film.timeline.cues;
    const frameAspect = doc.canvas.width / doc.canvas.height;
    const sheetW = opts.width ?? 2000;
    const cols = Math.max(1, opts.cols ?? sheetColumns(cues.length, frameAspect, sheetW));
    const rows = Math.ceil(cues.length / cols);

    const pad = 18;
    const cellW = Math.floor((sheetW - pad * (cols + 1)) / cols);
    const cellH = Math.round(cellW / frameAspect);
    const type = Math.max(11, Math.round(cellW * 0.042));
    const labelH = Math.round(type * 2.6);
    const sheetH = pad + rows * (cellH + labelH + pad);

    // sampling the midpoint of a scene is what makes a sheet legible: at frame
    // zero every entrance is still animating, so a sheet of first frames is a
    // sheet of half-drawn scenes
    const where = Math.min(0.95, Math.max(0.02, opts.at ?? 0.5));

    const cells: string[] = [];
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!;
      const t = cue.start + cue.dur * where;
      const frame = Math.min(film.frameCount - 1, Math.max(0, Math.round(t * doc.canvas.fps)));
      const png = await film.framePng(frame);
      opts.onFrame?.(i + 1, cues.length);

      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cellW + pad);
      const y = pad + row * (cellH + labelH + pad);
      const scene = doc.scenes[cue.index] as { camera?: unknown } | undefined;
      const cam = scene?.camera ? ' ◉' : '';

      cells.push(
        `<image x="${x}" y="${y}" width="${cellW}" height="${cellH}"`
        + ` xlink:href="data:image/png;base64,${png.toString('base64')}"/>`
        + `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="none"`
        + ` stroke="${taste.palette.border}" stroke-width="1"/>`
        + `<text x="${x}" y="${y + cellH + type * 1.25}" fill="${taste.palette.text}"`
        + ` font-family="JetBrains Mono" font-size="${type}">`
        + `${String(cue.index).padStart(2, '0')} ${esc(cue.id)}${cam}</text>`
        + `<text x="${x}" y="${y + cellH + type * 2.45}" fill="${taste.palette.muted}"`
        + ` font-family="JetBrains Mono" font-size="${Math.round(type * 0.86)}">`
        + `${fmt(cue.start)}→${fmt(cue.end)}  ${cue.dur.toFixed(1)}s</text>`,
      );
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
      + ` width="${sheetW}" height="${sheetH}">`
      + `<rect width="${sheetW}" height="${sheetH}" fill="${taste.palette.bg}"/>`
      + cells.join('')
      + `</svg>`;

    return {
      png: film.renderer.svgToPngAt(svg, sheetW),
      width: sheetW, height: sheetH, cols, rows, cells: cues.length,
    };
  } finally {
    await film.close();
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
