import { box, text, h, type El } from '@stingo/render';
import { clamp, interpolate, ease } from '@stingo/core';
import { scaleLinear } from 'd3-scale';
import { line as d3line, curveMonotoneX } from 'd3-shape';
import type { BlockCtx } from './ctx';
import { typeStyle } from './ctx';
import { T } from './stage';
import { lifecycle, enterP, animStyle } from './anim';
import { kicker } from './chrome';
import { z } from 'zod';
import { defineBlock } from './define';

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** Count a numeric value up on entrance. Non-numeric values just fade in. */
function countUp(target: string, p: number): string {
  const m = /^([^\d-]*)(-?[\d,.]+)(.*)$/.exec(target);
  if (!m) return target;
  const [, pre, numRaw, post] = m;
  const decimals = (numRaw!.split('.')[1] ?? '').length;
  const n = parseFloat(numRaw!.replace(/,/g, ''));
  if (!Number.isFinite(n)) return target;
  const cur = n * p;
  const hasComma = numRaw!.includes(',');
  const s = cur.toFixed(decimals);
  return `${pre}${hasComma ? Number(s).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s}${post}`;
}

export function statBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const p = enterP(c.t, c.taste, 0.1, 0.9);
  return box({ width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 0.5 },
    // a stat's value is the point of the scene; wrapping it would be worse than
    // shrinking it, and overflowing it worse than either. countUp can widen the
    // string mid-animation ("7" → "18x"), so fit against the final value.
    text({
      ...typeStyle(c, 'display', c.fit(String(s.value), 'display', T.huge(st), {
        maxWidth: st.contentW, wrap: false, floor: 0.3,
      }).size, palette.accent),
      ...animStyle('pop', enterP(c.t, c.taste, 0), c.taste),
      textAlign: 'center',
    }, countUp(s.value, p)),
    text({ ...typeStyle(c, 'display', c.fit(s.label, 'display', T.heading(st), {
        maxWidth: st.contentW, maxHeight: st.unit * 3.2,
      }).size, palette.text),
      ...lifecycle(c.t, c.dur, c.taste, 'rise', 0.28), textAlign: 'center' }, s.label),
    s.sub ? text({ ...typeStyle(c, 'body', T.body(st), palette.muted),
      ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.5), textAlign: 'center', maxWidth: st.contentW * 0.8 }, s.sub) : null,
  );
}

function barChart(s: any, c: BlockCtx): El {
  const { palette, motion } = c.taste;
  const st = c.stage;
  const max = Math.max(...s.data.map((d: any) => d.value), 1);
  const trackW = st.contentW * (st.orientation === 'landscape' ? 0.62 : 1);
  return box({ flexDirection: 'column', gap: st.unit * 0.62, width: trackW },
    ...s.data.map((d: any, i: number) => {
      const delay = 0.25 + i * Math.max(motion.stagger, 0.1);
      const gp = enterP(c.t, c.taste, delay, 0.7);
      const isHl = s.highlightIndex === i;
      // a value orders of magnitude below the max renders as a sub-pixel sliver,
      // which reads as "missing" rather than "small" — floor it at something visible
      const MIN_W = trackW * 0.012;
      const full = Math.max(d.value > 0 ? MIN_W : 0, (d.value / max) * trackW * 0.72);
      const barW = full * gp;
      return box({ flexDirection: 'column', gap: st.unit * 0.2, ...lifecycle(c.t, c.dur, c.taste, 'fade', delay) },
        box({ justifyContent: 'space-between', width: '100%' },
          text({ ...typeStyle(c, 'mono', T.small(st), isHl ? palette.accent : palette.muted) }, d.label),
          text({ ...typeStyle(c, 'mono', T.small(st), isHl ? palette.accent : palette.text) },
            `${countUp(String(d.value), gp)}${s.unit ?? ''}`),
        ),
        box({ width: '100%', height: st.unit * 0.9, background: palette.surface, borderRadius: 6 },
          box({ width: Math.max(0, barW), height: st.unit * 0.9, borderRadius: 6,
                background: isHl ? palette.accent : palette.accent2, opacity: isHl ? 1 : 0.75 }),
        ),
      );
    }),
  );
}

function lineChart(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const W = Math.round(st.contentW * (st.orientation === 'landscape' ? 0.6 : 1));
  const H = Math.round(W * (st.orientation === 'landscape' ? 0.42 : 0.6));
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const xs = scaleLinear().domain([0, Math.max(1, s.data.length - 1)]).range([pad.l, W - pad.r]);
  const max = Math.max(...s.data.map((d: any) => d.value), 1);
  const ys = scaleLinear().domain([0, max]).range([H - pad.b, pad.t]);
  const p = enterP(c.t, c.taste, 0.25, 1.1);

  // draw progressively by clipping the path to a growing width
  const path = d3line<any>().x((_d, i) => xs(i)).y((d) => ys(d.value)).curve(curveMonotoneX)(s.data) ?? '';
  const area = `${path} L ${xs(s.data.length - 1)} ${H - pad.b} L ${xs(0)} ${H - pad.b} Z`;
  const revealW = pad.l + (W - pad.l - pad.r) * p;
  const headI = Math.min(s.data.length - 1, Math.floor(p * (s.data.length - 1)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <clipPath id="rev"><rect x="0" y="0" width="${revealW.toFixed(1)}" height="${H}"/></clipPath>
      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${palette.accent}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></linearGradient>
    </defs>
    <g clip-path="url(#rev)">
      <path d="${area}" fill="url(#fill)"/>
      <path d="${path}" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    ${p > 0.02 ? `<circle cx="${xs(headI).toFixed(1)}" cy="${ys(s.data[headI].value).toFixed(1)}" r="7" fill="${palette.accent2}"/>` : ''}
  </svg>`;

  return box({ flexDirection: 'column', gap: st.unit * 0.4, ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.15) },
    h('img', { src: svgUri(svg), width: W, height: H }),
    box({ justifyContent: 'space-between', width: W },
      text({ ...typeStyle(c, 'mono', T.small(st) * 0.9, palette.muted) }, s.data[0]?.label ?? ''),
      text({ ...typeStyle(c, 'mono', T.small(st) * 0.9, palette.muted) }, s.data[s.data.length - 1]?.label ?? ''),
    ),
  );
}

export function chartBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  return box({ width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 1.1 },
    s.title ? box({ width: '100%', justifyContent: 'flex-start' }, kicker(s.title, c, 0)) : null,
    (s.kind ?? 'bar') === 'line' ? lineChart(s, c) : barChart(s, c),
  );
}

export function compareBlock(s: any, c: BlockCtx): El {
  const { palette, motion } = c.taste;
  const st = c.stage;
  const stacked = st.orientation === 'portrait';
  // flex:1 grows along the main axis — in a column stack that is vertical, which
  // collapses the columns to zero width. Portrait needs an explicit width.
  const col = (side: any, accent: string, delayBase: number) =>
    box({ flexDirection: 'column', gap: st.unit * 0.55, ...(stacked ? { width: '100%' } : { flex: 1 }),
        padding: st.unit * 0.85, background: palette.surface, borderRadius: c.taste.texture.cornerRadius,
        border: `2px solid ${palette.border}`,
        ...lifecycle(c.t, c.dur, c.taste, delayBase === 0 ? 'slideL' : 'slideR', delayBase) },
      text({ ...typeStyle(c, 'display', T.heading(st) * 0.85, accent) }, side.title),
      ...side.items.map((it: string, i: number) =>
        box({ alignItems: 'flex-start', gap: st.unit * 0.42,
              ...lifecycle(c.t, c.dur, c.taste, 'fade', delayBase + 0.22 + i * Math.max(motion.stagger, 0.09)) },
          text({ ...typeStyle(c, 'mono', T.small(st), accent), flexShrink: 0 }, '·'),
          text({ ...typeStyle(c, 'body', T.small(st) * 1.08, palette.text), flex: 1, minWidth: 0 }, it),
        )),
    );
  return box({ width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center',
      padding: `${st.padY}px ${st.padX}px` },
    box({ flexDirection: stacked ? 'column' : 'row', gap: st.unit * 0.8, width: '100%' },
      col(s.left, palette.danger, 0),
      col(s.right, palette.ok, 0.14),
    ),
  );
}


/* ── registration ───────────────────────────────────────────────────────── */

defineBlock({
  name: 'stat',
  describe: 'One big number that counts up, with a label.',
  fields: {
    value: z.string(),
    label: z.string(),
    sub: z.string().optional(),
    countFrom: z.string().optional(),
  },
  duration: { base: 4.5 },
  broll: { kind: 'pulse', opacity: 0.5 },
  render: statBlock,
});

defineBlock({
  name: 'chart',
  describe: 'An animated bar or line chart.',
  fields: {
    kind: z.enum(['bar', 'line']).default('bar'),
    title: z.string().optional(),
    data: z.array(z.object({ label: z.string(), value: z.number() })),
    unit: z.string().default(''),
    highlightIndex: z.number().int().optional(),
  },
  duration: { base: 7, estimate: (s: any) => 2.2 + s.data.length * 0.55 },
  broll: { kind: 'grid', opacity: 0.3 },
  render: chartBlock,
});

defineBlock({
  name: 'compare',
  describe: 'Two columns set against each other.',
  fields: {
    left: z.object({ title: z.string(), items: z.array(z.string()) }),
    right: z.object({ title: z.string(), items: z.array(z.string()) }),
  },
  duration: { base: 7.5, estimate: (s: any) => 2 + (s.left.items.length + s.right.items.length) * 0.55 },
  broll: { kind: 'grid', opacity: 0.28 },
  render: compareBlock,
});
