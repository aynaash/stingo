import { box, text, type El } from '@stingo/render';
import { clamp, interpolate } from '@stingo/core';
import type { BlockCtx } from './ctx';
import { typeStyle } from './ctx';
import { T } from './stage';
import { lifecycle, enterP, typed } from './anim';
import { windowFrame } from './chrome';
import { luminance, ensureContrast } from '@stingo/themes';

/** Syntax colours ship tuned for their own theme's background. Against a
 *  different surface they can fall below readable, so they get lifted. */
const legibleCache = new Map<string, string>();
function legible(color: string, surface: string): string {
  const key = `${color}|${surface}`;
  const hit = legibleCache.get(key);
  if (hit) return hit;
  const out = ensureContrast(color, surface, 4.0).hex;
  legibleCache.set(key, out);
  return out;
}

type Tok = { content: string; color?: string };
let _hl: any = null;
const LANGS = ['ts', 'tsx', 'js', 'go', 'rust', 'python', 'bash', 'json', 'yaml', 'sql', 'html', 'css', 'c', 'java'];

/** A syntax theme is not the taste's to choose — it has to match the surface it
 *  sits on, or code becomes unreadable. Dark and light are both loaded so the
 *  right one can be picked per render. */
export const CODE_THEMES = { dark: 'material-theme-palenight', light: 'github-light' } as const;

/** Shiki is expensive to boot (~500ms) so it is created once per process
 *  and every frame reuses the cached token arrays. */
export async function initHighlighter() {
  if (_hl) return _hl;
  const { createHighlighter } = await import('shiki');
  _hl = await createHighlighter({ themes: [CODE_THEMES.dark, CODE_THEMES.light], langs: LANGS });
  return _hl;
}

const tokenCache = new Map<string, Tok[][]>();

export function tokenize(code: string, lang: string, theme: string = CODE_THEMES.dark): Tok[][] {
  const key = `${lang}::${theme}::${code}`;
  const hit = tokenCache.get(key);
  if (hit) return hit;
  if (!_hl) throw new Error('highlighter not initialised — call initHighlighter() before rendering code blocks');
  const useLang = LANGS.includes(lang) ? lang : 'ts';
  const { tokens } = _hl.codeToTokens(code, { lang: useLang, theme });
  const out: Tok[][] = tokens.map((line: any[]) => line.map((t) => ({ content: t.content, color: t.color })));
  tokenCache.set(key, out);
  return out;
}

export function codeBlock(s: any, c: BlockCtx): El {
  const { palette, motion } = c.taste;
  const st = c.stage;
  const code = (s.code ?? '').replace(/\n+$/, '');
  // pick the syntax theme from the surface the code sits on, then hold every
  // token to the house readability floor against that same surface
  const lightSurface = luminance(palette.surface) > 0.45;
  const lines = tokenize(code, s.lang ?? 'ts', lightSurface ? CODE_THEMES.light : CODE_THEMES.dark)
    .map((toks) => toks.map((t) => ({ ...t, color: t.color ? legible(t.color, palette.surface) : t.color })));
  const size = T.code(st);
  const lineH = size * c.taste.type.mono.lineHeight;
  const hl = new Set<number>(s.highlight ?? []);
  const reveal = s.reveal ?? 'lines';
  const gutterW = size * 2.6;

  const body = box({ flexDirection: 'column', padding: `${st.unit * 0.7}px ${st.unit * 0.5}px`, width: '100%' },
    ...lines.map((toks, i) => {
      const delay = reveal === 'lines' ? 0.18 + i * Math.max(motion.stagger * 0.55, 0.035) : 0.18;
      const stl = reveal === 'all'
        ? lifecycle(c.t, c.dur, c.taste, 'fade', 0.15)
        : lifecycle(c.t, c.dur, c.taste, 'slideL', delay, 0.34);
      const isHl = hl.has(i + 1);
      // highlighted lines get a delayed accent sweep so the eye is led there
      const hlP = isHl ? enterP(c.t, c.taste, 0.15 + lines.length * 0.04 + 0.25, 0.5) : 0;
      const lineText = toks.map((t) => t.content).join('');
      const shown = reveal === 'typewriter'
        ? typed(lineText, clamp(interpolate(c.t, [0.2 + i * 0.28, 0.2 + i * 0.28 + 0.42], [0, 1])))
        : null;

      return box({
        ...stl, alignItems: 'flex-start', width: '100%',
        background: isHl ? `rgba(167,139,250,${(0.16 * hlP).toFixed(3)})` : 'transparent',
        borderLeft: `3px solid ${isHl ? palette.accent : 'transparent'}`,
        paddingLeft: st.unit * 0.4, paddingRight: st.unit * 0.4,
        minHeight: lineH,
      },
        text({ ...typeStyle(c, 'mono', size, isHl ? palette.accent : palette.border), width: gutterW, flexShrink: 0 }, String(i + 1)),
        shown !== null
          ? text({ ...typeStyle(c, 'mono', size, palette.text), whiteSpace: 'pre' }, shown || ' ')
          : box({ flexWrap: 'nowrap' },
              ...toks.map((tk) => text({
                ...typeStyle(c, 'mono', size, tk.color ?? palette.text), whiteSpace: 'pre',
              }, tk.content === '' ? ' ' : tk.content)),
            ),
      );
    }),
  );

  return box({ width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center',
      padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 0.9 },
    windowFrame(c, `${s.lang ?? 'ts'}`, body, { width: '100%', ...lifecycle(c.t, c.dur, c.taste, 'pop', 0) }),
    s.caption ? text({
      ...typeStyle(c, 'body', T.small(st), palette.muted),
      ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.4), textAlign: 'center', width: '100%',
    }, s.caption) : null,
  );
}

/** Commands type themselves in, output appears after. Reads as a real session. */
export function terminalBlock(s: any, c: BlockCtx): El {
  const { palette } = c.taste;
  const st = c.stage;
  const size = T.code(st) * 1.05;

  // walk the script to find when each line starts
  let cursor = 0.3;
  const timed = s.lines.map((ln: any) => {
    const start = cursor + (ln.delay ?? 0);
    const typeDur = ln.cmd ? Math.min(1.6, 0.22 + ln.cmd.length * 0.028) : 0;
    const outAt = start + typeDur + 0.18;
    cursor = outAt + (ln.out ? 0.35 + Math.min(0.8, ln.out.split('\n').length * 0.12) : 0.2);
    return { ...ln, start, typeDur, outAt };
  });

  const body = box({ flexDirection: 'column', padding: st.unit * 0.8, gap: st.unit * 0.24, width: '100%' },
    ...timed.flatMap((ln: any, i: number) => {
      const els: El[] = [];
      if (ln.cmd) {
        const p = clamp(interpolate(c.t, [ln.start, ln.start + ln.typeDur], [0, 1], { ease: 'linear' }));
        if (p > 0) {
          const shown = typed(ln.cmd, p);
          const caret = p < 1 && Math.floor(c.t * 3) % 2 === 0 ? '▋' : '';
          els.push(box({ alignItems: 'baseline', gap: size * 0.5, width: '100%' },
            text({ ...typeStyle(c, 'mono', size, palette.accent2), flexShrink: 0 }, ln.prompt ?? '$'),
            text({ ...typeStyle(c, 'mono', size, palette.text), whiteSpace: 'pre-wrap', flex: 1, minWidth: 0 }, shown + caret),
          ));
        }
      }
      if (ln.out && c.t >= ln.outAt) {
        const op = clamp(interpolate(c.t, [ln.outAt, ln.outAt + 0.2], [0, 1]));
        els.push(...ln.out.split('\n').map((o: string) =>
          text({ ...typeStyle(c, 'mono', size * 0.95, palette.muted), opacity: op,
                 whiteSpace: 'pre-wrap', width: '100%' }, o || ' ')));
      }
      return els;
    }),
  );

  return box({ width: st.w, height: st.h, flexDirection: 'column', justifyContent: 'center', padding: `${st.padY}px ${st.padX}px` },
    windowFrame(c, s.title ?? 'bash', body, { width: '100%', ...lifecycle(c.t, c.dur, c.taste, 'pop', 0) }),
  );
}
