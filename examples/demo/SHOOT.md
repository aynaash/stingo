# Shot list — stingo — the video is a text file

Generated from `video.yaml`. Do not edit by hand — re-run:

```bash
bun run tools/shootlist.ts examples/demo/video.yaml -o examples/demo/SHOOT.md
```

**3 takes** · cut runs 0:50 · 1920×1080 @ 30fps · 128.9 BPM

Each take is **one continuous recording**. Where a take is read from more
than once, the later scene picks up further into the same file — do not
cut between them.

---

## 1. `01-hook.mp4`

**Record at least 8s.** Used by 1 scene.

### 0:00 → 0:07 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Name card:** Hersi — hersietech.com
- **Cutting to:** code (yaml) — the script

> Every video you have seen about code was made by dragging rectangles around a timeline. I got tired of that.

*20 words in 7.9s — about 151 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 2. `02-beat.mp4`

**Record at least 8s.** Used by 1 scene.

### 0:26 → 0:33 · reads from 0s · pip

- **Framing:** a 576px inset in the bottom right, circular crop — sit closer than feels natural
- **Cutting from:** compare — video.yaml vs taste.json
- **Cutting to:** stat — 33ms a frame

> Every cut you are watching landed on a beat of the track, because the script knows the tempo.

*18 words in 7.2s — about 150 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 3. `03-close.mp4`

**Record at least 7s.** Used by 1 scene.

### 0:39 → 0:45 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** stat — 33ms a frame
- **Cutting to:** outro — stingo

> And this video, the one you are watching, was made by the thing it is about.

*16 words in 6.4s — about 149 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## When the takes exist

```bash
stingo takes  examples/demo/video.yaml      # resolution, fps, length, audio
stingo render examples/demo/video.yaml --draft
stingo render examples/demo/video.yaml
```

Delete a scene's `dur:` once its take is shot and the scene runs as long
as you actually spoke.
