A taste profile is the other half of a film. The script says what you are
talking about; the taste says what it looks and feels like. Neither mentions
the other.

```bash
stingo render script.yaml --taste dusk
stingo render script.yaml --taste ./ember.json
```

Same script, different film.

## What a taste sets, and what it does not

This is the distinction the whole system rests on.

A taste declares **intent**: a brand colour, light or dark, a mood, a density.
Everything a designer would call a *relationship* — type ratios, spacing
rhythm, contrast floors, the lightness ramp of the neutrals, the order things
animate in — lives in the house style and is not the taste's to set.

That is why two different profiles still look like stingo videos, and why a
badly chosen palette still produces a readable one.

## Deriving one

You should almost never write a palette by hand:

```bash
stingo taste "#ff7a18" --name Ember --mood bouncy --texture film --save ember.json
```

```
  ████ bg          #130905  ground
  ████ text        #fef1ea  17.8:1
  ████ muted       #a9826e  5.7:1
  ████ accent      #ef7e39  7.2:1
  ████ accent2     #2ecaf5  10.2:1
```

What it actually does with your hex:

- Places every neutral on a **measured OKLab lightness ramp**, taken from the
  reference theme rather than guessed, so derived palettes feel the same.
- Bleeds a trace of your hue into those neutrals. That is what makes a palette
  read as authored rather than as grey with an accent bolted on.
- Normalises the accent to a target lightness and chroma, so any brand hue
  lands with comparable punch instead of whatever you happened to type.
- Derives a support hue by rotation, unless you give one with `--support`.
- Locks semantic colours to fixed hues, so green reads as success in every
  taste.
- **Lifts anything failing the contrast floors**, and tells you what it moved.

The colours on this documentation site are the output of that command.

## palette

| Key | |
|---|---|
| `bg` | the ground everything sits on |
| `surface` · `surfaceAlt` | raised panels — code windows, cards |
| `border` | hairlines and outlines |
| `text` · `muted` | body and secondary text |
| `accent` · `accent2` | the brand hue and its support |
| `ok` · `warn` · `danger` | hue-locked semantics |

## type

```yaml
type:
  display: { family: JetBrains Mono, weight: 800, tracking: -0.03, lineHeight: 1.05 }
  body:    { family: Inter, weight: 400, lineHeight: 1.45 }
  mono:    { family: JetBrains Mono, weight: 400, lineHeight: 1.55 }
  scale: 1
```

`transform` (`none` · `upper` · `lower`) is available per face. `scale`
multiplies every size at once.

Sizes themselves are not yours to set: they come from one modular ratio applied
consistently, which is most of what separates designed typography from
arbitrary font sizes.

Fonts are read from `assets/fonts` as static `.ttf`/`.otf`. Variable fonts are
skipped with a warning — satori's parser cannot read an `fvar` table.

## motion

The single knob that most changes how a video feels.

| Field | | Default |
|---|---|---|
| `personality` | `snappy` · `smooth` · `bouncy` · `mechanical` | `snappy` |
| `enter` / `exit` | seconds for a standard entrance | `0.45` / `0.3` |
| `stagger` | seconds between staggered siblings | `0.07` |
| `ease` | easing curve name | `expo.out` |
| `travel` | entrance distance in px at 1080 wide | `48` |
| `spring` | stiffness, damping, mass — used when `ease: spring` | |

Personality maps to a curve and a travel distance, and the mapping is the
house's, so `snappy` means the same thing in every profile.

## pacing

| Field | | Default |
|---|---|---|
| `sceneMin` / `sceneMax` | seconds; the planner clamps and warns | `3` / `14` |
| `wordsPerMinute` | narration speed, for estimating from `say` | `155` |
| `cutOn` | `free` · `beat` · `bar` | `bar` |
| `breath` | dead air held after a line lands | `0.35` |

`cutOn: bar` is what makes every cut land on a downbeat. Camera scenes ignore
it by default — see [talking head](camera).

## texture

Cheap to render, enormous effect on whether a video looks made.

| Field | Range | Default |
|---|---|---|
| `grain` | 0–1 | `0.05` |
| `scanlines` | 0–1 | `0` |
| `vignette` | 0–1 | `0.35` |
| `glow` | 0–1 | `0.4` |
| `grid` | 0–1 | `0.08` |
| `cornerRadius` | px | `20` |

None of these are SVG filters. A `feGaussianBlur` over two megapixels costs
about 9.5 seconds a frame. Grain, vignette and scanlines are a lookup table
built once and applied to the RGBA buffer in a tight loop — a few milliseconds.

## transition and music

```yaml
transition: { kind: fade, duration: 0.25 }
music: { energy: medium, duckDb: -12, targetLufs: -14 }
```

`kind` is `cut` · `fade` · `wipe` · `whip` · `glitch` · `slide`.
`targetLufs` is the loudness the final mix is normalised to; −14 is what the
platforms want.

## Checking one

```bash
stingo doctor ./ember.json
```

Audits against the house floors — body 7:1, muted 4.5:1, accents 4.5:1 — and
reports which failures are repaired automatically at render time.

Body text sits well above the WCAG 4.5 minimum on purpose: video is watched
small, on phones, often in daylight.
