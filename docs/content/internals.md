Three decisions shape everything else. None of them is about video.

## A frame is a pure function of its index

```ts
const px = await film.framePixels(4821);
```

Frame 4821 renders without rendering the 4820 before it. Nothing is stateful
across frames; anything that varies over time is derived from the frame number.

That one constraint buys:

- **Seekable scrubbing.** Seeking is a call, not a render.
- **Parallel rendering.** Frames split into contiguous ranges across processes.
  No worker needs to know what another did.
- **Deterministic output.** Same input, same bytes. B-roll is seeded, grain is a
  fixed lookup, nothing samples the clock.
- **Cheap re-renders.** Change one scene, re-render its range.

It is also the constraint most likely to be violated by accident. If you find
yourself wanting state between frames, derive it from `t` instead.

## Layout is CSS, drawing is SVG

[satori](https://github.com/vercel/satori) does real flexbox layout and emits
SVG, with no browser anywhere; [resvg](https://github.com/thx/resvg-js)
rasterises it.

Procedural graphics that flexbox cannot express — b-roll fields, chart paths,
the camera mask — are hand-written SVG spliced into the same document and
rasterised in one pass:

```ts
composite(await renderer.toSvg(el), { defs, behind, infront, mask });
```

`behind` goes under satori's output, `infront` over it, `defs` into a shared
`<defs>`. One rasterisation, not three.

## Cuts land on the music

Point it at a track and the beat grid is detected:

- **Onsets** from spectral flux — frame-to-frame increases in magnitude,
  summed across bins.
- **Tempo** by autocorrelation of the onset envelope, weighted by a log-normal
  prior centred near 120 BPM, which is what stops it picking half or double
  time.
- **Downbeat** by testing candidate offsets against onset strength.

Then scene *ends* snap to bars. In the example film every scene after the first is an
exact 8, 12, 16 or 20 beats — not by hand, by construction.

```bash
stingo beats assets/music/loop128.mp3
```

## Where the milliseconds went

Rendering 1080×1920 went from 585 ms a frame to 33 ms. In order of what
mattered:

**`loadSystemFonts: false` on resvg — −440 ms.** satori already embeds glyph
paths, so scanning 649 system fonts on every frame was pure waste. resvg still
needs real font files for hand-written `<text>` in b-roll, so those are passed
explicitly.

**`.pixels` instead of `.asPng()` — −110 ms.** ffmpeg wants raw RGBA. PNG
compression was work thrown away immediately.

**No full-frame SVG filters.** `feGaussianBlur` over two megapixels costs about
9.5 seconds a frame; `feTurbulence` about 1.5. Glow became analytic radial
gradients. Grain, vignette and scanlines became a lookup table built once and
applied to the pixel buffer in a tight loop — around 20 ms.

Every one of those was deleting work, not adding cleverness.

## Throughput

Frames split into contiguous ranges, one process each. Every worker encodes its
own MP4 segment, and the segments are concatenated with stream copy — no
re-encode, and **no pixel data ever crosses a process boundary**.

Documents with camera takes give each worker its own decoder as well as its own
encoder. That sounds like oversubscription and measures as the opposite — 45 s,
49 s and 65 s for 8, 4 and 2 workers on an 8-thread laptop — because ffmpeg
spends enough time blocked on IO to leave room. So the default stays one worker
per thread.

## Compositing a take

resvg returns **premultiplied** RGBA. That is worth knowing, because it makes
source-over under the frame a single multiply-add:

```
dst.rgb += src.rgb × (1 − dst.a)
```

No division, no unpremultiply round trip. The camera pass relies on it, and so
would anything else compositing under a rasterised frame.

## Packages

```
stingo/   the published package — public API, builder, bin
schema/   zod schemas — taste profile + video document
core/     time, easing, interpolation, springs, beat grid
render/   satori → resvg → RGBA, SVG compositing, texture pass
audio/    FFT, onset detection, tempo, mixing, loudness
media/    probe footage, read it as a function of time, composite it
encode/   ffmpeg rawvideo pipe → MP4
blocks/   scene renderers, b-roll generators, layout stage
themes/   built-in taste profiles, derivation, contrast audit
film/     timeline planner, frame compositor, parallel renderer
studio/   live preview server
mcp/      the MCP server — tools an agent drives
cli/      the stingo command
```

## What is in-tree, and why

Beat detection, easing, interpolation and the texture pass are written here
rather than pulled in. They are the parts that decide how the videos *feel*,
and that is not a dependency decision.

Everything that is a solved problem is a dependency: satori and resvg
(MPL-2.0), Shiki, zod, d3-shape, d3-scale, yaml.
