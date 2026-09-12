# stingo

[![ci](https://github.com/aynaash/stingo/actions/workflows/ci.yml/badge.svg)](https://github.com/aynaash/stingo/actions/workflows/ci.yml)
[![docs](https://img.shields.io/badge/docs-aynaash.github.io%2Fstingo-ef7e39)](https://aynaash.github.io/stingo/)
[![licence](https://img.shields.io/badge/licence-AGPL--3.0-ef7e39)](./LICENSE)
[![built by Claude](https://img.shields.io/badge/built%20by-Claude-d97757)](#who-wrote-this)

Declarative video for people who ship content. Write a YAML script, point it at a
taste profile, get a rendered MP4 — vertical or horizontal, with cuts that land on
the beat.

**[Documentation](https://aynaash.github.io/stingo/)** ·
**[Watch what it makes](https://aynaash.github.io/stingo/#what-comes-out)** ·
**[Roadmap](./ROADMAP.md)**

*Stingo* is Sheng — the Swahili-English creole spoken in Nairobi — for
**aesthetics**. Which is the whole idea: the look of a film is a thing you can
name, keep in its own file, and swap. Your script never mentions a colour.

## Let your AI make it

A video here is a text file, so a model can write one — and, more importantly,
render a frame and *look at what it made*. Clone the repository and your agent
picks up `.mcp.json` automatically:

```bash
git clone https://github.com/aynaash/stingo
cd stingo && bun install
```

Then just ask it. The MCP server hands the agent eleven tools, and the loop that
works is: read the docs, validate, plan, **render a frame and look at it**, then
render the film.

```
you     make me a five minute explainer on Go concurrency.
        vertical, dark, cuts on the beat

claude  ⏺ stingo_docs      script, blocks
        ⏺ stingo_validate  ✓ 53 scenes, 1080x1920
        ⏺ stingo_plan      4:56 · every cut on a downbeat
        ⏺ stingo_still     at 23.0s  →  the frame, returned as an image
```

`stingo_still` returns the PNG itself, not a path. That is the whole point: a
model that can see the frame catches what a schema cannot — a headline that
wrapped badly, a chart bar that is invisible, a scene that ends before anyone
could read it.

Full setup, every tool, and the guards: **[Connect your AI](https://aynaash.github.io/stingo/mcp)**.
[AGENTS.md](./AGENTS.md) is what an agent working in this repository should read first.

## Or write it yourself

```bash
bun add @hersidev/stingo   # library + `stingo` and `stingo-mcp` commands
```

A typed script:

```ts
// film.ts
import { film, title, code, stat, outro } from '@hersidev/stingo';

export default film('Goroutines in ninety seconds')
  .vertical()
  .taste('bootdev')
  .music('./track.mp3')
  .add(
    title('Goroutines').kicker('ninety seconds').bg('beams'),
    code('go', src).highlight(4, 5).caption('go starts it; the channel says when it finished.'),
    stat('18x', 'faster').sub('Same CPU. It simply stopped waiting in line.'),
    outro('Now go write something concurrent').handle('@you'),
  );
```

```bash
stingo render film.ts --horizontal --taste dusk
```

…or the same thing as YAML, which is easier to generate:

```bash
stingo render video.yaml
```

Both parse into the same validated document and go through the same renderer.
Scenes are ordinary values, so ordinary code composes them — `.add(items.map(i =>
statement(i)))` works, and so does any loop, filter or helper you write.

## The idea

A video is two files:

| File | Holds | Example |
|---|---|---|
| `video.yaml` | **what you say** — scenes, code, data, narration | "Goroutines are not threads" |
| `taste.json` | **how it looks and moves** — palette, type, motion, pacing, grain | Neon Campus |

Nothing in the taste profile mentions your topic, and nothing in the script
mentions a colour. Swap the taste file and the same script becomes a different
film. That separation is the whole point.

## Taste sets parameters, stingo owns relationships

A taste profile is not a stylesheet. It declares *intent* — a brand colour, light
or dark, a mood, a density — and stingo derives the system around it.

```bash
stingo taste "#ff6b35" --mode dark --mood bouncy --texture crt --save ember.taste.json
stingo doctor ember.taste.json
```

From one hex you get a full palette: neutrals carrying a trace of the brand hue
so it reads as one family, semantic colours hue-locked so green always means
success, and every value checked against a contrast floor and lifted if it falls
short. The derivation runs in OKLab, because shifting lightness in sRGB or HSL
turns a hue muddy or neon.

| Stingo decides, always | You decide |
|---|---|
| Type *ratios* — one modular scale, not eight arbitrary sizes | Base size, font families |
| Spacing rhythm — every gap a multiple of one unit | Density: tight / normal / airy |
| Contrast floors — body 7:1, accents 4.5:1 | Hue, brand colour, light or dark |
| Entrance choreography: rule → kicker → headline → sub | Mood, travel distance |
| Word-level stagger on display text | Easing curve, timing |
| Beat-locked cut grammar | Cut discipline: bar / beat / free |
| Window chrome for code and terminal | Corner radius, grain, texture |
| Syntax theme picked to match the surface | — |
| Platform safe areas | — |

The house rules live in `packages/themes/src/house.ts` — one file, readable in a
minute, and the reason two unrelated taste profiles still look like they came
from the same tool. `stingo doctor` audits a hand-written profile against them;
anything it can fix, it fixes at render time and tells you.

## Why it is built this way

**A composition is a pure function of frame number.** `film.framePixels(4821)`
renders frame 4821 without rendering the 4820 before it. That single constraint
buys seekable scrubbing, parallel rendering across processes, deterministic
output, and cheap re-renders.

**Layout is CSS, drawing is SVG.** [satori](https://github.com/vercel/satori) does
real flexbox layout and emits SVG with no browser involved;
[resvg](https://github.com/thx/resvg-js) rasterises it. Procedural graphics that
flexbox cannot express — b-roll fields, chart paths — are hand-written SVG spliced
into the same document and rasterised in one pass.

**Cuts land on the music.** Point it at a track and the beat grid is detected
(spectral-flux onsets, autocorrelation tempo with a log-normal prior to avoid
octave errors). Scene ends snap to bars, so every cut lands on a downbeat. In the
example film every scene after the first is an exact 8, 12, 16 or 20 beats — not by hand, by
construction.

## Library

Everything the CLI uses is exported from the package, so you can drive the
pipeline yourself:

```ts
import { Film, renderVideo, plan, derive, analyzeBeats, THEMES } from '@hersidev/stingo';

const { taste } = derive({ id: 'mine', brand: '#ff6b35', mode: 'dark', mood: 'bouncy' });
const grid = await analyzeBeats('./track.mp3');
const film = await Film.create({ doc, taste, grid });

await film.framePng(120);                 // one frame, for a thumbnail
await renderVideo({ doc, taste, grid, out: 'out.mp4', workers: 8 });
```

`Film` is a pure function of frame number, so `framePixels(n)` is safe to call
from anywhere, in any order, on any worker.

## Commands

```bash
stingo render <doc>      # → MP4
stingo still  <doc> --at 12.5 -o frame.png
stingo plan   <doc>      # print the timeline, render nothing
stingo beats  <audio>    # tempo, downbeat, onsets, loudness
stingo preview <doc>     # live scrubbing preview at localhost:4321
stingo tastes            # list built-in profiles
stingo takes   <doc>     # inspect the camera takes a script references
stingo blocks            # every scene type and the fields it takes
stingo taste  <hex>      # derive a taste profile from one brand colour
stingo doctor <taste>    # audit a profile against the contrast floors
```

Useful flags: `--horizontal` / `--vertical` / `--square`, `--taste <name|path>`,
`--draft` (fast low-quality pass), `--workers <n>`, `--music <file>`, `--bpm <n>`,
`--no-camera` (placeholders instead of decoding footage).

## A scene

```yaml
- block: code
  lang: go
  caption: Send on one side, receive on the other.
  highlight: [4, 7]
  bg: { kind: orbits, opacity: 0.55 }
  code: |
    ch := make(chan string)
    go func() { ch <- "done" }()
    msg := <-ch
```

Scene length is inferred from content — lines of code, number of list items,
length of narration — then clamped by the taste profile's pacing and snapped to
the beat grid. Set `dur` to override, in seconds (`4s`), beats (`8b`) or bars
(`2bar`).

## Blocks

`title` · `statement` · `code` · `terminal` · `stat` · `list` · `chart` ·
`diagram` · `image` · `quote` · `compare` · `broll` · `camera` · `outro`

`stingo blocks` lists them with every field. A block is one `defineBlock` call in
one file, with no central list to edit — see the Blocks page in the docs.

## B-roll

Eleven procedural animated backgrounds, deterministic from a seed, no footage
needed: `grid` `dots` `particles` `waves` `codeRain` `beams` `pulse` `orbits`
`mesh` `terrain` `noise` `none`. Each block picks a sensible default; override
with `bg`.

## Packages

```
stingo/   the published package — public API, builder, bin
schema/   zod schemas — taste profile + video document
core/     time, easing, interpolation, springs, beat grid
render/   satori → resvg → RGBA, SVG compositing, texture pass
audio/    FFT, onset detection, tempo, mixing, loudness
media/    probe real footage, read it as a function of time, composite it
encode/   ffmpeg rawvideo pipe → MP4
blocks/   scene renderers, b-roll generators, layout stage
themes/   built-in taste profiles
film/     timeline planner, frame compositor, parallel renderer
studio/   live preview server
mcp/      the MCP server — tools an agent drives
cli/      the stingo command
```

## Performance notes

Rendering 1080×1920 went from 585 ms/frame to 33 ms during development. What
mattered, in order:

1. **`loadSystemFonts: false`** on resvg — satori already embeds glyph paths, so
   scanning 649 system fonts per frame was pure waste. *(−440 ms)*
2. **`.pixels` instead of `.asPng()`** — ffmpeg wants raw RGBA; PNG compression
   was work thrown away. *(−110 ms)*
3. **No full-frame SVG filters.** `feGaussianBlur` over 2 MP costs ~9.5 s and
   `feTurbulence` ~1.5 s. Glow became analytic radial gradients; grain and
   vignette moved to a precomputed LUT applied to the pixel buffer (~20 ms).

One thing is still slow on purpose: an `image` scene costs ~350ms a frame
against ~33ms for text, because resvg resamples the bitmap into the canvas on
every frame. Compositing decoded pixels the way camera takes already are would
fix it; until then, a few image scenes cost a few seconds and a film made mostly
of images will be slow.

Throughput comes from process parallelism: frames are split into contiguous
ranges, each worker encodes its own MP4 segment, and segments are concatenated
with stream copy. No pixel data ever crosses a process boundary.

## Talking head

An explainer usually needs the explainer in it. `camera:` puts a recorded take
into a scene, and it sits on *any* block, not just its own:

```yaml
- block: camera                       # the take is the whole scene
  camera: { src: takes/01-hook.mp4, layout: full, scrim: 0.2 }
  lower: { name: Hersi, role: hersietech.com }

- block: code                         # ...or a corner inset over code
  lang: go
  code: |
    go download("a.txt")
  camera: { src: takes/02.mp4, from: 6, layout: pip, corner: br, size: 0.28 }

- block: chart                        # ...or beside it
  data: [{ label: before, value: 585 }, { label: after, value: 33 }]
  camera: { src: takes/03.mp4, layout: split, side: right, ratio: 0.34 }
```

```
  full                    pip                     split
┌─────────────┐        ┌─────────────┐        ┌──────┬──────┐
│             │        │  code {}    │        │      │ code │
│   ( you )   │        │          ┌──┤        │ (you)│  {}  │
│             │        │          │yo│        │      │      │
└─────────────┘        └──────────┴──┘        └──────┴──────┘
```

`from` is the in-point in the take, so one long recording can feed many scenes.
`zoom`, `offsetX`, `offsetY` and `mirror` reframe without re-shooting; `shape:
circle`, `corner` and `size` place an inset; `ring` outlines it in the accent
colour.

**Audio comes from the take.** Each one is trimmed to its scene, delayed to its
timeline position, ducked under the music and normalised to −14 LUFS. There is
no manual sync step — the timeline already knows where the scene starts.

**Length comes from the take too.** A `camera` scene with no `dur:` runs exactly
as long as its clip, and unlike every other block it is not clamped by the
taste's pacing or snapped to a downbeat — snapping speech to a bar clips the
last word. Add `cut: bar` to opt back in.

### Writing before shooting

Every command works with `takes/` empty, which is the point: lock the edit
first, then record to fit it.

```bash
stingo plan   script.yaml              # the cut, with no footage at all
stingo render script.yaml --no-camera  # a watchable rough, placeholders with timecode
stingo takes  script.yaml              # once shot: resolution, fps, length, audio
```

`stingo takes` warns when a take is shorter than the scene reading from it, was
shot below the box it feeds, or was recorded slower than the canvas frame rate.

[`examples/building-stingo`](./examples/building-stingo) is a full worked
script — an eight-minute horizontal cut and a vertical reel — written against
footage that does not exist yet.

### How a take gets into the frame

The take is never drawn into the SVG; it is pixels, and an SVG document cannot
carry them cheaply. Instead the renderer cuts a hole where the camera goes and
the decoded frame is blended in underneath after rasterising:

```ts
import { VideoSource, blendUnder } from 'stingo/media';

const src = await VideoSource.open('./clip.mp4', 30);
const layer = await src.at(12.5, { w: 1080, h: 1920 });   // any time, any order
```

Which layers the hole cuts through is what sets z-order — mask the background
only and the take sits behind the caption (`full`); mask the block content too
and the inset sits over the code (`pip`). resvg returns *premultiplied* RGBA, so
compositing under it is one multiply-add per channel and no division.

`VideoSource` presents a file as a pure function of time: it holds one ffmpeg
process at a cursor, walks it forward for the common case of a render sweeping
through a scene, and restarts only on a seek. Decoding costs 4–14 ms per frame
depending on the box — comparable to the SVG pass beside it.

The one ordering that matters is cropping *before* scaling. Scale first and
swscale resizes the whole source up to cover the box: a 1280×720 webcam feeding
a 1080×1920 canvas becomes 3413×1920, six megapixels a frame, most of it then
discarded. Cropping to the box's aspect at source resolution and scaling that
once is **7× faster** on exactly that case — 120 frames in 0.73 s against 5.1 s.

Each render worker runs its own decoder alongside its own encoder. That sounds
like oversubscription, and it measures as the opposite — 45 s, 49 s and 65 s for
8, 4 and 2 workers on an 8-thread laptop — because ffmpeg spends enough time
blocked on IO to leave room. So the default stays one worker per thread.

## Where this is going

The goal is the complete technical content library for engineers: everything
between having something to explain and having published it, expressible as
code, reviewable as a diff, reproducible on a build server.

Next up is narration, then blocks that read your repository — a
`diff` block that renders a real commit, a terminal block that runs the command
rather than quoting what you remember it printing, and `stingo check` in CI to
fail the build when a video's code no longer matches the code.

[ROADMAP.md](./ROADMAP.md) has the ordering, and what is explicitly not being
built.

## Who wrote this

**This project is written and maintained entirely by Claude** — Anthropic's
Claude Code — working from direction by [Hersi](https://github.com/aynaash).
Every line of source, every test, every page of these docs, and the launch
video's script were produced by the model. Hersi decides what it should do and
what "good" means; Claude does the building.

That is not a disclaimer, it is the interesting part. A few things it is worth
being precise about:

- **The measurements are real.** Where the docs claim 7× or 585 ms → 33 ms,
  those were measured on the machine, and at least one "optimisation" was
  reverted when a clean re-measurement showed it made things slower.
- **The tests are real.** CI typechecks and runs the suite on Linux and macOS
  with ffmpeg installed, then plans every example and renders stills and a clip
  end to end.
- **It is still software with bugs in it.** Being model-written makes it
  neither more nor less trustworthy than any other young project. Read the code,
  and open an issue when it renders something wrong.

The commit history carries session links, so you can see how each change was
arrived at.

## A note on `npm audit`

Installing reports **3 moderate** advisories, all of them the same one:
`fflate` 0.7.x, reached through satori. There is no fixed version upstream, and
the issue is a denial of service when parsing a malformed ZIP64 archive —
something stingo never does. It is noted here so it does not read as a surprise.

## Requirements

**Bun ≥ 1.3** and ffmpeg ≥ 6 on `PATH`.

Bun is a hard requirement, not a preference: the pipeline drives ffmpeg through
`Bun.spawn` and reads files through `Bun.file`. Running on Node would mean
putting an adapter in front of process spawning and file IO. That is a
reasonable thing to want and an easy thing to add — it just has not been done,
and `engines.bun` says so rather than failing at import time.

Fonts are read from `assets/fonts` (static `.ttf`/`.otf`). Variable fonts are
skipped with a warning, because satori's parser cannot read an `fvar` table.

## Building and publishing

```bash
bun run tools/build.ts     # bundle + emit .d.ts into packages/stingo/dist
npm publish ./packages/stingo
```

The `exports` map puts the `bun` condition first, so inside this workspace — and
for any Bun consumer — the TypeScript source runs directly and no build step is
needed to develop. Everyone else resolves the bundled ESM and its declarations.
satori, resvg, shiki, zod and the d3 modules stay external; resvg ships a native
binary that must not be inlined.

## Dependencies

All permissive, all actively maintained: satori (MPL-2.0), @resvg/resvg-js
(MPL-2.0), shiki (MIT), zod (MIT), d3-shape/d3-scale (ISC), yaml (ISC). Beat
detection, easing, interpolation and the texture pass are in-tree — they are the
parts that decide how the videos feel.
