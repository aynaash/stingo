import { box, text, type El } from '@stingo/render';
import { clamp, interpolate } from '@stingo/core';
import { typeStyle, type BlockCtx } from './ctx';
import { T } from './stage';

export interface CaptionView {
  words: { text: string }[];
  activeIndex: number;
  /** seconds since this cue appeared, for the entrance */
  age: number;
  /** `word` picks out the word being said; `line` is a plain subtitle, which
   *  is what you want under a recorded take where the timing is estimated and
   *  a highlight that lands on the wrong word is worse than no highlight. */
  style?: 'word' | 'line';
}

/** Burned-in captions.
 *
 *  Sits above the platform safe area rather than at the very bottom: on a
 *  phone the last ~12% of a vertical frame is under the UI, and a caption
 *  placed there is unreadable on the platform it was made for. */
export function captionLayer(v: CaptionView, c: BlockCtx): El {
  const st = c.stage;
  const { palette } = c.taste;
  const size = T.body(st) * (st.orientation === 'portrait' ? 1.28 : 1.0);
  const pop = clamp(interpolate(v.age, [0, 0.16], [0, 1], { ease: 'expo.out' }));

  // Anchored from the top, not the bottom: satori resolves `top` reliably and
  // `bottom` inconsistently, so the band's position is computed rather than
  // inferred. Height is fixed for the same reason.
  const bandH = Math.round(size * 4.2);
  const safe = Math.round(st.h * (st.orientation === 'portrait' ? 0.145 : 0.085));
  const top = st.h - safe - bandH;

  return box({
    position: 'absolute', left: 0, top,
    width: st.w, height: bandH,
    justifyContent: 'center', alignItems: 'flex-end',
    paddingLeft: st.padX, paddingRight: st.padX,
  },
    box({
      flexWrap: 'wrap', justifyContent: 'center',
      // satori applies only the first value of a two-value `gap`, so both axes
      // are named — see the note in text.ts/wordStack
      rowGap: `${(size * 0.16).toFixed(2)}px`,
      columnGap: `${(size * 0.34).toFixed(2)}px`,
      maxWidth: st.contentW,
      // a scrim keeps the words legible over a bright frame without a hard box
      paddingLeft: size * 0.6, paddingRight: size * 0.6,
      paddingTop: size * 0.34, paddingBottom: size * 0.34,
      background: `${palette.bg}cc`,
      borderRadius: size * 0.5,
      transform: `scale(${(0.96 + pop * 0.04).toFixed(3)})`,
      opacity: pop,
    },
      ...v.words.map((w, i) => {
        if (v.style === 'line') {
          // a plain subtitle: one weight, no tracking of position
          return text({ ...typeStyle(c, 'display', size, palette.text) }, w.text);
        }
        const active = i === v.activeIndex;
        return text({
          ...typeStyle(c, 'display', size, active ? palette.accent : palette.text),
          // said words stay bright, unsaid ones sit back — the eye follows
          opacity: i < v.activeIndex ? 0.55 : 1,
        }, w.text);
      }),
    ),
  );
}
