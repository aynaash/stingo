import { z } from 'zod';
import { box, text, h, type El } from '@stingo/render';
import { clamp, interpolate, rng } from '@stingo/core';
import { defineBlock } from './define';
import { typeStyle, type BlockCtx } from './ctx';
import { T, type Stage } from './stage';
import { lifecycle, enterP } from './anim';
import { kicker } from './chrome';

/** Boxes and arrows.
 *
 *  Layout is an explicit grid — `at: [col, row]` — rather than an automatic
 *  graph layout. Auto-layout is unpredictable frame to frame and impossible to
 *  art-direct; for the six-to-ten node diagrams an explainer actually uses,
 *  saying where things go is both simpler and better.
 *
 *  Nodes are satori boxes so text wraps and centres properly. Edges are drawn
 *  as one SVG image behind them, because flexbox cannot express an arrow. */

const NodeKind = z.enum(['box', 'store', 'queue', 'actor', 'ghost']);
const EdgeStyle = z.enum(['solid', 'dashed', 'thick']);

const Node = z.object({
  id: z.string(),
  label: z.string(),
  /** grid position: [column, row], 0-indexed */
  at: z.tuple([z.number(), z.number()]),
  kind: NodeKind.default('box'),
  /** how many columns wide, for a node that spans */
  span: z.number().default(1),
  note: z.string().optional(),
  accent: z.boolean().default(false),
});

const Edge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  style: EdgeStyle.default('solid'),
  /** curve the line; 0 is straight, positive bows one way */
  bend: z.number().default(0),
  /** arrowheads at both ends */
  both: z.boolean().default(false),
  accent: z.boolean().default(false),
});

type NodeT = z.infer<typeof Node>;
type EdgeT = z.infer<typeof Edge>;
interface Rect { x: number; y: number; w: number; h: number }

const esc = (n: number) => Number(n.toFixed(2));

/** Grid → pixel rectangles. Computed here rather than read back from satori,
 *  because edges must be drawn before the nodes are laid out. */
function layout(nodes: NodeT[], st: Stage, title: boolean): Map<string, Rect> {
  const cols = Math.max(1, ...nodes.map((n) => n.at[0] + n.span));
  const rows = Math.max(1, ...nodes.map((n) => n.at[1] + 1));

  const availW = st.contentW;
  const topPad = title ? st.unit * 2.6 : 0;
  const availH = st.h - st.padY * 2 - topPad;

  // rows need real space between them: an arrow squeezed into 40px reads as a
  // smudge, and an edge label has nowhere to sit
  const gapX = st.unit * (cols <= 2 ? 1.4 : 0.9);
  // past a point a wider box stops reading as a node and starts reading as a
  // banner, so cap it and centre the grid in whatever is left
  const cellW = Math.min((availW - gapX * (cols - 1)) / cols, st.unit * 11);
  const gridW = cellW * cols + gapX * (cols - 1);
  const originX = st.padX + Math.max(0, (availW - gridW) / 2);

  // A box taller than this stops reading as a box, so cell height is capped —
  // but capping alone leaves a small diagram marooned in the middle of a tall
  // frame. Spend the leftover height on the gaps instead, which is also where
  // the arrows and their labels live.
  let gapY = st.unit * 2.4;
  const cellH = Math.min((availH - gapY * (rows - 1)) / rows, st.unit * 3.4);
  if (rows > 1) {
    const slack = availH - (cellH * rows + gapY * (rows - 1));
    if (slack > 0) gapY = Math.min(gapY + slack / (rows - 1), st.unit * 6);
  }

  // centre whatever is left over
  const gridH = cellH * rows + gapY * (rows - 1);
  const originY = st.padY + topPad + Math.max(0, (availH - gridH) / 2);

  const out = new Map<string, Rect>();
  for (const n of nodes) {
    out.set(n.id, {
      x: originX + n.at[0] * (cellW + gapX),
      y: originY + n.at[1] * (cellH + gapY),
      w: cellW * n.span + gapX * (n.span - 1),
      h: cellH,
    });
  }
  return out;
}

/** Where a line from `from` to `to` leaves the source rectangle. */
function edgePoint(r: Rect, towards: { x: number; y: number }) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // scale the direction vector until it hits the rectangle border
  const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export interface EdgeLabel { x: number; y: number; text: string; opacity: number }

/** Edges as one SVG layer, revealed by growing each path's dash offset.
 *
 *  Labels come back as placements rather than SVG `<text>`: satori silently
 *  drops text from an embedded SVG image, and its own text layout is better
 *  anyway. The caller draws them as absolutely positioned elements. */
function edgeLayer(
  edges: EdgeT[], rects: Map<string, Rect>, c: BlockCtx, delayBase: number,
): { svg: string; labels: EdgeLabel[] } {
  const { palette } = c.taste;
  const parts: string[] = [];
  const labels: EdgeLabel[] = [];
  const headSize = c.stage.unit * 0.42;

  edges.forEach((e, i) => {
    const a = rects.get(e.from), b = rects.get(e.to);
    if (!a || !b) return;   // an edge to a node that does not exist just vanishes

    const p = enterP(c.t, c.taste, delayBase + i * 0.08, 0.5);
    if (p <= 0.001) return;

    const from = edgePoint(a, centre(b));
    const to = edgePoint(b, centre(a));
    const col = e.accent ? palette.accent : palette.border;
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    // bow perpendicular to the line
    const nx = -(to.y - from.y), ny = to.x - from.x;
    const len = Math.hypot(nx, ny) || 1;
    const ctrl = { x: mid.x + (nx / len) * e.bend * 120, y: mid.y + (ny / len) * e.bend * 120 };

    const d = e.bend === 0
      ? `M ${esc(from.x)} ${esc(from.y)} L ${esc(to.x)} ${esc(to.y)}`
      : `M ${esc(from.x)} ${esc(from.y)} Q ${esc(ctrl.x)} ${esc(ctrl.y)} ${esc(to.x)} ${esc(to.y)}`;

    const width = e.style === 'thick' ? 4 : 2.2;
    const dash = e.style === 'dashed' ? `stroke-dasharray="10 8"` : '';
    // reveal by clipping the stroke with a dash that grows to full length
    const total = Math.hypot(to.x - from.x, to.y - from.y) * (e.bend ? 1.25 : 1) + 4;
    const reveal = e.style === 'dashed'
      ? `stroke-dasharray="10 8"`
      : `stroke-dasharray="${esc(total)}" stroke-dashoffset="${esc(total * (1 - p))}"`;

    parts.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${width}" stroke-linecap="round" ${reveal} opacity="${esc(e.style === 'dashed' ? p : 1)}"/>`);

    // arrowhead, once the line has arrived
    if (p > 0.92) {
      const ang = Math.atan2(to.y - (e.bend ? ctrl.y : from.y), to.x - (e.bend ? ctrl.x : from.x));
      const tip = (a2: number) => `${esc(to.x - Math.cos(ang + a2) * headSize)},${esc(to.y - Math.sin(ang + a2) * headSize)}`;
      parts.push(`<polygon points="${esc(to.x)},${esc(to.y)} ${tip(0.45)} ${tip(-0.45)}" fill="${col}"/>`);
      if (e.both) {
        const ang2 = ang + Math.PI;
        const tip2 = (a2: number) => `${esc(from.x - Math.cos(ang2 + a2) * headSize)},${esc(from.y - Math.sin(ang2 + a2) * headSize)}`;
        parts.push(`<polygon points="${esc(from.x)},${esc(from.y)} ${tip2(0.45)} ${tip2(-0.45)}" fill="${col}"/>`);
      }
    }

    if (e.label) {
      const lp = clamp(interpolate(p, [0.55, 0.95], [0, 1]));
      if (lp > 0.01) {
        labels.push({
          x: e.bend ? (from.x + 2 * ctrl.x + to.x) / 4 : mid.x,
          y: e.bend ? (from.y + 2 * ctrl.y + to.y) / 4 : mid.y,
          text: e.label,
          opacity: lp,
        });
      }
    }
  });

  return { svg: parts.join(''), labels };
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

function nodeEl(n: NodeT, r: Rect, c: BlockCtx, delay: number): El {
  const { palette, texture } = c.taste;
  const st = c.stage;
  const stl = lifecycle(c.t, c.dur, c.taste, 'pop', delay);
  const accent = n.accent ? palette.accent : palette.border;

  // shape hints: a store reads as a cylinder, a queue as a stack, a ghost as a
  // dashed placeholder for something outside the system
  const shape =
    n.kind === 'store' ? { borderRadius: `${st.unit * 1.2}px / ${st.unit * 0.55}px` }
    : n.kind === 'queue' ? { borderRadius: 4, borderLeft: `6px solid ${palette.accent2}` }
    : n.kind === 'actor' ? { borderRadius: 999 }
    : n.kind === 'ghost' ? { borderStyle: 'dashed', opacity: 0.65 }
    : { borderRadius: texture.cornerRadius };

  return box({
    position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h,
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: st.unit * 0.15, padding: st.unit * 0.4,
    background: n.accent ? palette.surfaceAlt : palette.surface,
    border: `2px solid ${accent}`, ...shape, ...stl,
  },
    text({ ...typeStyle(c, 'display', T.small(st) * 1.15, n.accent ? palette.accent : palette.text), textAlign: 'center' }, n.label),
    n.note ? text({ ...typeStyle(c, 'mono', T.small(st) * 0.78, palette.muted), textAlign: 'center' }, n.note) : null,
  );
}

export function diagramBlock(s: any, c: BlockCtx): El {
  const st = c.stage;
  const nodes: NodeT[] = s.nodes;
  const edges: EdgeT[] = s.edges ?? [];
  const rects = layout(nodes, st, !!s.title);

  const nodeDelay = 0.12;
  const stagger = Math.max(c.taste.motion.stagger, 0.08);
  const edgesStart = nodeDelay + nodes.length * stagger * 0.6;

  const { svg: edgeSvg, labels } = edgeLayer(edges, rects, c, edgesStart);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${st.w}" height="${st.h}" viewBox="0 0 ${st.w} ${st.h}">${edgeSvg}</svg>`;

  const labelFs = T.small(st) * 0.84;
  const labelW = (t: string) => Math.ceil(t.length * labelFs * 0.62) + labelFs * 1.1;

  return box({ width: st.w, height: st.h, position: 'relative' },
    s.title
      ? box({ position: 'absolute', left: st.padX, top: st.padY }, kicker(s.title, c, 0))
      : null,
    // edges sit behind the nodes
    h('img', { src: svgUri(svg), width: st.w, height: st.h, style: { position: 'absolute', left: 0, top: 0 } }),
    ...nodes.map((n, i) => nodeEl(n, rects.get(n.id)!, c, nodeDelay + i * stagger)),
    // labels last, so they sit above both edges and nodes
    ...labels.map((l) =>
      box({
        position: 'absolute',
        left: l.x - labelW(l.text) / 2, top: l.y - labelFs * 0.95,
        width: labelW(l.text), height: labelFs * 1.9,
        alignItems: 'center', justifyContent: 'center',
        background: c.taste.palette.bg, borderRadius: labelFs * 0.5,
        opacity: l.opacity,
      }, text({ ...typeStyle(c, 'mono', labelFs, c.taste.palette.muted) }, l.text))),
  );
}

defineBlock({
  name: 'diagram',
  describe: 'Boxes and arrows on an explicit grid — architecture, data flow, state.',
  fields: {
    title: z.string().optional(),
    nodes: z.array(Node).min(1),
    edges: z.array(Edge).default([]),
  },
  duration: {
    // base is only the floor for a trivial diagram; length should track how
    // much there is to take in, so the estimate does the real work here
    base: 5,
    estimate: (s: any) => 2.4 + s.nodes.length * 0.6 + (s.edges?.length ?? 0) * 0.35,
  },
  broll: { kind: 'grid', opacity: 0.25 },
  render: diagramBlock,
});
