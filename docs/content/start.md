stingo turns a text file into an MP4. This page gets one rendering on your
machine, then changes a line so you can see the loop it is built around.

## What you need

**Bun 1.3 or newer** and **ffmpeg 6 or newer** on your `PATH`.

ffmpeg is not optional — it decodes footage, mixes audio and encodes the video.

```bash
bun --version
ffmpeg -version | head -1
```

Bun is a hard requirement rather than a preference: the pipeline drives ffmpeg
through `Bun.spawn` and reads files through `Bun.file`.

## Render the example

```bash
git clone https://github.com/aynaash/stingo
cd stingo
bun install

bun stingo render examples/goroutines/video.yaml
```

That writes `out/video.mp4` — about five minutes of vertical video, cut to a
128 BPM track. The first render is the slow one: fonts load, the syntax
highlighter warms up, and every frame is drawn from scratch.

Add `--draft` while you are iterating. It drops the encoder to `ultrafast` and
the quality to `crf 30`, which is unwatchable for publishing and perfectly fine
for checking a layout.

## See the cut before you render it

Rendering thousands of frames to find out a scene is too short is a waste.
`plan` resolves the whole timeline and prints it, rendering nothing:

```bash
bun stingo plan examples/goroutines/video.yaml
```

```
   0 title      0:00→0:04  4.17s (8.9 beats)   title-0
   1 statement  0:04→0:07  3.72s (8.0 beats)   statement-1
   2 stat       0:07→0:11  3.72s (8.0 beats)   stat-2
```

Every scene is a whole number of beats because the taste profile says
`cutOn: bar`, so scene ends snap to the detected downbeat grid.

## Look at one frame

```bash
bun stingo still examples/goroutines/video.yaml --at 45 -o frame.png
```

A still goes through the same pixel path as a render — same fonts, same
texture pass — so what you see is what the video will contain. This is the
fastest way to check a layout.

## Change something

Open `examples/goroutines/video.yaml` and find the first scene:

```yaml
- block: title
  kicker: concurrency
  text: Your program is waiting
  sub: Most of the time, it is doing nothing at all.
  bg: { kind: beams, opacity: 0.6, speed: 0.8 }
```

Change `text`, then render a still of it:

```bash
bun stingo still examples/goroutines/video.yaml --at 2.5 -o frame.png
```

No timeline to nudge, no keyframe to find. That loop — edit a line, look at a
frame — is the entire premise.

## Change how it looks

The script above contains no colours. Those live in a separate file, so you can
swap the whole look without touching a word of content:

```bash
bun stingo still examples/goroutines/video.yaml --at 23 --taste dusk -o dusk.png
bun stingo still examples/goroutines/video.yaml --at 23 --taste bootdev -o boot.png
```

Or derive a fresh profile from a single brand colour:

```bash
bun stingo taste "#ff7a18" --name Ember --mood bouncy --save ember.json
bun stingo still examples/goroutines/video.yaml --at 23 --taste ember.json -o ember.png
```

`stingo taste` does not just tint things. It places your hue on a measured
lightness ramp, bleeds a trace of it into the neutrals, and lifts any colour
that fails the contrast floors — it will tell you when it does.

## Scrub it live

```bash
bun stingo preview examples/goroutines/video.yaml
```

Serves a scrubbable preview on `localhost:4321` that re-plans when you save the
file. Because any frame is one function call, seeking is not a render — it is
a lookup.

## Write your own

The smallest document that renders:

```yaml
title: My first film
canvas: { preset: vertical, fps: 30 }
taste: bootdev

scenes:
  - block: title
    text: It works
    sub: That is the whole file.
```

```bash
bun stingo render my.yaml
```

Scene length is inferred from content and clamped by the taste's pacing, so you
can leave `dur` off until a scene actually feels wrong.

## Where to go next

- [The script](script) — every field of a video document
- [Blocks](blocks) — the fourteen scene types
- [Taste profiles](taste) — palette, motion, pacing, texture
- [Talking head](camera) — putting yourself in the frame
