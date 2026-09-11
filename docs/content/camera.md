Everything else stingo draws is generated from text. A take is not — it is
decoded video, composited into the frame. This is how an explainer gets the
explainer in it.

## The short version

```yaml
- block: camera
  camera: { src: takes/01-hook.mp4, layout: full, scrim: 0.2 }
  lower: { name: Hersi, role: hersietech.com }
```

`camera:` is not limited to the `camera` block. It sits on **any** scene:

```yaml
- block: code
  lang: go
  code: |
    go download("a.txt")
  camera: { src: takes/02.mp4, from: 6, layout: pip, corner: br }
```

## Three layouts

```text
  full                pip                 split

┌───────────┐      ┌───────────┐      ┌─────┬─────┐
│           │      │ code {}   │      │     │code │
│  ( you )  │      │        ┌──┤      │(you)│ {}  │
│           │      │        │yo│      │     │     │
└───────────┘      └────────┴──┘      └─────┴─────┘

  delivery           over code          side by side
```

| Layout | The take | The block content |
|---|---|---|
| `full` | fills the frame | draws **over** it — captions stay readable |
| `pip` | a corner inset | draws **under** it — the inset sits on top |
| `split` | one side | the other side, in its own smaller stage |

Choose per scene. One long recording can feed all three, because `from` picks
the in-point.

## Every field

| Field | Type | Default | |
|---|---|---|---|
| `src` | path | — | the take, relative to the document |
| `from` | time | `0` | in-point within the take |
| `layout` | `full` · `pip` · `split` | `full` | |
| `fit` | `cover` · `contain` | `cover` | crop to fill, or letterbox |
| `zoom` | 1–4 | `1` | push in past the fit |
| `offsetX` / `offsetY` | −1–1 | `0` | pan, as a fraction of the box |
| `mirror` | boolean | `false` | matches the webcam preview you recorded against |
| `scrim` | 0–1 | `0` | darken the take so text over it stays readable |
| `ring` | boolean | `true` | accent outline (pip and split) |
| `mute` | boolean | `false` | drop this take's audio from the mix |
| `gainDb` | number | `0` | |

**pip only**

| Field | Type | Default | |
|---|---|---|---|
| `corner` | `tl` · `tr` · `bl` · `br` | `br` | |
| `size` | 0.08–0.9 | `0.3` | width as a fraction of the canvas |
| `aspect` | 0.2–4 | `1` | width ÷ height |
| `shape` | `rounded` · `circle` · `square` | `rounded` | |
| `margin` | 0–0.3 | `0.055` | gap from the frame edge |

**split only**

| Field | Type | Default | |
|---|---|---|---|
| `side` | `left` · `right` · `top` · `bottom` | `left` | |
| `ratio` | 0.2–0.8 | `0.5` | share of the frame the take takes |

## Audio comes from the take

There is no sync step. Each take is trimmed to the slice its scene uses,
delayed to that scene's position on the timeline, mixed with any other speech,
ducked under the music by a sidechain compressor, and normalised to the taste's
target loudness.

The timeline already knows when the scene starts, so alignment is arithmetic
rather than nudging.

That is why the advice is to **record clean audio into the same file as the
picture**. A separate recorder puts you back in the business of aligning two
files by hand.

If a take's sound is unusable, set `mute: true` and put the words in
`audio.vo` instead.

## Length comes from the take too

A `camera` scene with no `dur:` runs exactly as long as its clip, measured at
render time.

Two rules are suspended for it, both because it contains speech:

- **Pacing bounds do not apply.** `sceneMax` exists to stop a caption lingering
  on screen, not to cut a sentence in half.
- **It cuts `free`, not on the bar.** Snapping the end of speech to a downbeat
  clips the last word. Set `cut: bar` on the scene to opt back in.

A take that runs out before its scene does holds on its last frame rather than
failing the render. `stingo takes` warns you first.

## Writing before you shoot

This is the part worth internalising: **every command works with no footage at
all.** Lock the edit first, then record to fit it.

```bash
stingo plan   script.yaml              # the cut, with nothing shot
stingo render script.yaml --no-camera  # a watchable rough
```

With `--no-camera`, each take's box is drawn as a placeholder carrying the
source timecode it would be reading — so you can see the shape of the edit and
know exactly what to record.

Once footage exists:

```bash
stingo takes script.yaml
```

```
take.mp4  1920x1080 · 30.00fps · 4:12 · has audio
  scene  0  full   0:00→0:14 reading from 0:00
  scene  3  pip    1:07→1:14 reading from 0:06
```

It warns when a take is **shorter** than the scenes reading from it, was shot
**below** the box it feeds, or was recorded at a **lower frame rate** than the
canvas.

## Framing for each layout

The box a take lands in decides how close you need to sit:

- **full** fills the canvas. Anything smaller than it gets upscaled.
- **pip** is around 28% of the frame width — roughly 540px on a 1920 canvas.
  Sit closer than feels natural; a wide shot at inset size is a dot.
- **split** is 34–50% of the width. Frame yourself off-centre toward the side
  the take sits on, so you are not looking out of the panel.

Leave headroom. `zoom`, `offsetX` and `offsetY` reframe after the fact, but
they cannot invent picture outside what you shot.

## In TypeScript

```ts
import { film, camera, code } from 'stingo';

export default film('Launch')
  .horizontal()
  .add(
    camera('takes/01-hook.mp4', { scrim: 0.2 })
      .lower('Hersi', 'hersietech.com')
      .say('I got tired of dragging rectangles around a timeline.'),

    code('go', 'go download("a.txt")')
      .camera('takes/02.mp4', { layout: 'pip', corner: 'br', shape: 'circle' }),
  );
```

## How it actually works

The take is never drawn into the SVG — it is pixels, and an SVG document cannot
carry them cheaply. Instead:

1. The renderer builds the frame with a **mask** punching a hole where the take
   goes.
2. resvg rasterises that to RGBA, leaving the hole transparent.
3. The decoded take is blended in **underneath**.

Which layers the hole cuts through is what sets z-order. Mask only the
background and the take sits behind the block content — that is `full`, and why
a caption stays on top. Mask the block content too and the take sits over it —
that is `pip`.

resvg returns **premultiplied** RGBA, so compositing under it is
`dst + src × (1 − dst.a)`: one multiply and one add per channel, no division.

Decoding is a `VideoSource`, which presents a file as a pure function of time.
It holds one ffmpeg process at a cursor, walks it forward when a render sweeps
through a scene, and restarts only on a seek. Each render worker owns its own,
so contiguous frame ranges stay on the fast path.

The one ordering that matters is cropping **before** scaling. Scale first and
swscale resizes the whole source up to cover the box — a 1280×720 webcam
feeding a 1080×1920 canvas becomes 3413×1920, six megapixels a frame, most of
it discarded. Cropping to the box's aspect at source resolution and scaling
that once measures **7× faster** on exactly that case: 120 frames in 0.73 s
against 5.1 s.
