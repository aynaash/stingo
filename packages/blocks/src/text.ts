import { box, text, h, type El } from '@stingo/render';
import { clamp, interpolate } from '@stingo/core';
import type { BlockCtx } from './ctx';
import { typeStyle } from './ctx';
import { T } from './stage';
import { lifecycle, enterP, animStyle, typed } from './anim';
import { kicker } from './chrome';

/** Words animate in individually. This is what makes titles feel authored
 *  rather than typeset — the single highest-leverage motion detail. */
export function wordStack(content: string, c: BlockCtx, opts: {
  size: number; color: string; kind?: 'display'|'body'|'mono'; delay?: number;
  align?: 'left'|'center'; emphasis?: string[]; emphasisColor?: string; anim?: Parameters<typeof animStyle>[0];
}): El {
  const { taste } = c;
  const words = content.split(/\s+/).filter(Boolean);
  const gap = taste.motion.stagger;
  const base = opts.delay ?? 0;
  const emph = new Set((opts.emphasis ?? []).map((e) => e.toLowerCase().replace(/[.,!?:;]/g, '')));
  return box({
    flexWrap: 'wrap', gap: `${opts.size * 0.12}px ${opts.size * 0.3}px`,
    justifyContent: opts.align === 'left' ? 'flex-start' : 'center',
    width: '100%',
  },
    ...words.map((wd, i) => {
      const st = lifecycle(c.t, c.dur, taste, opts.anim ?? 'rise', base + i * gap);
      const isEmph = emph.has(wd.toLowerCase().replace(/[.,!?:;]/g, ''));
      return text({
        ...typeStyle(c, opts.kind ?? 'display', opts.size, isEmph ? (opts.emphasisColor ?? taste.palette.accent) : opts.color),
        ...st,
      }, wd);
    }),
  );
}

export function titleBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const align = s.align ?? 'center';
  return box({
    width: st.w, height: st.h, flexDirection: 'column',
    justifyContent: 'center', alignItems: align === 'left' ? 'flex-start' : 'center',
    padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 1.1,
  },
    s.kicker ? kicker(s.kicker, c, 0) : null,
    wordStack(s.text, c, { size: T.display(st), color: palette.text, kind: 'display', delay: 0.12, align }),
    s.sub ? text({
      ...typeStyle(c, 'body', T.body(st), palette.muted),
      ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.12 + s.text.split(/\s+/).length * c.taste.motion.stagger),
      textAlign: align, maxWidth: st.contentW * 0.86,
    }, s.sub) : null,
  );
}

export function statementBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  return box({
    width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    padding: `${st.padY}px ${st.padX}px`,
  },
    wordStack(s.text, c, {
      size: T.title(st), color: palette.text, kind: 'display', delay: 0.05,
      emphasis: s.emphasis ?? [], emphasisColor: palette.accent,
    }),
  );
}

export function quoteBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const p = enterP(c.t, c.taste, 0);
  return box({
    width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center',
    padding: `${st.padY}px ${st.padX}px`, gap: st.unit,
  },
    box({ alignItems: 'flex-start', gap: st.unit * 0.9 },
      box({ width: 5, height: interpolate(p, [0, 1], [0, T.title(st) * 2.4]), background: palette.accent, borderRadius: 3 }),
      box({ flexDirection: 'column', gap: st.unit * 0.6, flex: 1 },
        wordStack(s.text, c, { size: T.heading(st), color: palette.text, kind: 'body', delay: 0.1, align: 'left' }),
        s.attrib ? text({
          ...typeStyle(c, 'mono', T.small(st), palette.muted),
          ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.5),
        }, `— ${s.attrib}`) : null,
      ),
    ),
  );
}

const MARKERS: Record<string, (i: number) => string> = {
  num: (i) => `${String(i + 1).padStart(2, '0')}`, dot: () => '•', arrow: () => '→', check: () => '✓',
};

export function listBlock(s: any, c: BlockCtx): El {
  const { palette, motion } = c.taste;
  const st = c.stage;
  const mk = MARKERS[s.marker ?? 'arrow'] ?? MARKERS.arrow!;
  return box({
    width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center',
    padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 1.2,
  },
    s.title ? text({ ...typeStyle(c, 'display', T.title(st), palette.text), ...lifecycle(c.t, c.dur, c.taste, 'rise', 0) }, s.title) : null,
    box({ flexDirection: 'column', gap: st.unit * 0.78, width: '100%' },
      ...s.items.map((item: string, i: number) => {
        const d = 0.22 + i * Math.max(motion.stagger, 0.13);
        const stl = lifecycle(c.t, c.dur, c.taste, 'slideL', d);
        return box({ alignItems: 'flex-start', gap: st.unit * 0.7, ...stl },
          text({ ...typeStyle(c, 'mono', T.body(st), palette.accent2), minWidth: st.unit * 1.5 }, mk(i)),
          text({ ...typeStyle(c, 'body', T.body(st), palette.text), flex: 1 }, item),
        );
      }),
    ),
  );
}

export function outroBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const p = enterP(c.t, c.taste, 0.1);
  return box({
    width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 1.2,
  },
    box({ ...animStyle('pop', p, c.taste), flexDirection: 'column', alignItems: 'center', gap: st.unit * 0.7 },
      text({ ...typeStyle(c, 'display', T.title(st), palette.text), textAlign: 'center' }, s.text),
      s.sub ? text({ ...typeStyle(c, 'body', T.body(st), palette.muted), textAlign: 'center' }, s.sub) : null,
    ),
    s.handle ? box({
      ...lifecycle(c.t, c.dur, c.taste, 'rise', 0.45),
      padding: `${st.unit * 0.5}px ${st.unit * 1.1}px`, borderRadius: 999,
      border: `2px solid ${palette.accent}`, background: palette.surface,
    }, text({ ...typeStyle(c, 'mono', T.body(st) * 0.95, palette.accent) }, s.handle)) : null,
  );
}

export function brollBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  if (!s.caption) return box({ width: st.w, height: st.h });
  return box({
    width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'flex-end',
    padding: `${st.padY}px ${st.padX}px`,
  },
    text({
      ...typeStyle(c, 'mono', T.body(st), palette.muted),
      ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.2),
    }, s.caption),
  );
}
