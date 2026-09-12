# Shot list — I built a video tool and it published itself

Generated from `reel.yaml`. Do not edit by hand — re-run:

```bash
bun run tools/shootlist.ts examples/building-stingo/reel.yaml -o SHOOT-REEL.md
```

**4 takes** · cut runs 1:00 · 1080×1920 @ 30fps · 128.9 BPM

Each take is **one continuous recording**. Where a take is read from more
than once, the later scene picks up further into the same file — do not
cut between them.

---

## 1. `reel-01-hook.mp4`

**Record at least 6s.** Used by 1 scene.

### 0:00 → 0:06 · reads from 0s · full

- **Framing:** fills the frame (1080×1920) — anything smaller is upscaled
- **Name card:** Hersi
- **Cutting to:** statement — "This video is a text file."

> I got tired of dragging rectangles around a timeline, so I made the video a text file. This one is the text file.

*23 words in 6.0s — about 230 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 2. `reel-02-two.mp4`

**Record at least 8s.** Used by 1 scene.

### 0:09 → 0:17 · reads from 0s · pip

- **Framing:** a 346px inset in the bottom right, circular crop — sit closer than feels natural
- **Over:** code (yaml) — That scene is these four lines.
- **Cutting from:** statement — "This video is a text file."
- **Cutting to:** compare — video.yaml vs taste.json

---

## 3. `reel-03-ai.mp4`

**Record at least 7s.** Used by 1 scene.

### 0:28 → 0:35 · reads from 0s · full

- **Framing:** fills the frame (1080×1920) — anything smaller is upscaled
- **Cutting from:** statement — "Swap one file and it is a different film."
- **Cutting to:** stat — 33ms per frame

> And because it is just text, a model can write one — then render a single frame and actually look at what it made before committing to anything.

*28 words in 7.0s — about 240 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 4. `reel-04-close.mp4`

**Record at least 6s.** Used by 1 scene.

### 0:48 → 0:54 · reads from 0s · full

- **Framing:** fills the frame (1080×1920) — anything smaller is upscaled
- **Cutting from:** terminal — bun add @hersidev/stingo
- **Cutting to:** outro — stingo

> It is open source, and the script for this exact reel is in the repo. Link in the bio.

*19 words in 6.0s — about 190 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## When the takes exist

```bash
stingo takes  examples/building-stingo/reel.yaml      # resolution, fps, length, audio
stingo render examples/building-stingo/reel.yaml --draft
stingo render examples/building-stingo/reel.yaml
```

Delete a scene's `dur:` once its take is shot and the scene runs as long
as you actually spoke.
