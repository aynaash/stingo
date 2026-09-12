# Shot list — I built a video tool and it published itself

Generated from `video.yaml`. Do not edit by hand — re-run:

```bash
bun run tools/shootlist.ts examples/building-stingo/video.yaml -o SHOOT.md
```

**14 takes** · cut runs 7:32 · 1920×1080 @ 30fps · 128.9 BPM

Each take is **one continuous recording**. Where a take is read from more
than once, the later scene picks up further into the same file — do not
cut between them.

---

## 1. `01-hook.mp4`

**Record at least 13s.** Used by 1 scene.

### 0:00 → 0:13 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Name card:** Hersi — hersietech.com
- **Cutting to:** statement — "This video was made by the thing it is about."

> Every video you have watched about code was made by dragging rectangles around a timeline. I got tired of that. So the video became a text file — and this one is the first thing that text file made.

*39 words in 13.0s — about 180 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 2. `02-problem.mp4`

**Record at least 24s.** Used by 2 scenes.

### 0:24 → 0:39 · reads from 0s · pip

- **Framing:** a 499px inset in the bottom right — sit closer than feels natural
- **Cutting from:** code (yaml) — That last scene was these four lines.
- **Cutting to:** list — What one change costs

> Here is what editing software actually costs you. Every change means finding the clip, dragging the edge, nudging the keyframe, then watching it back to see if it landed. The work is real. None of it is the idea.

*39 words in 15.0s — about 156 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

### 0:39 → 0:46 · reads from 16s · pip

- **Framing:** a 499px inset in the bottom right — sit closer than feels natural
- **Over:** list — What one change costs
- **Cutting from:** camera
- **Cutting to:** statement — "None of that is the idea. It is bookkeeping."

---

## 3. `03-wish.mp4`

**Record at least 11s.** Used by 1 scene.

### 0:50 → 1:01 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** statement — "None of that is the idea. It is bookkeeping."
- **Cutting to:** code (diff) — This is the whole ask.

> What I wanted was a diff. Change one line, run one command, get a new video. The way you change code.

*21 words in 11.0s — about 115 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 4. `04-two-files.mp4`

**Record at least 25s.** Used by 2 scenes.

### 1:13 → 1:20 · reads from 0s · split

- **Framing:** about 730px wide, on the left — frame yourself off-centre toward that side
- **Over:** compare — video.yaml vs taste.json
- **Cutting from:** title — "A video is two files"
- **Cutting to:** camera

### 1:20 → 1:33 · reads from 12s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** compare — video.yaml vs taste.json
- **Cutting to:** breathing room — Same script. Three taste profiles.

> The script never names a colour. The taste file never names your topic. Swap the taste and the same script is a different film. That separation is the whole tool. It is also what the name means — stingo is Sheng, from Nairobi, for aesthetics.

*45 words in 13.0s — about 208 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 5. `05-taste.mp4`

**Record at least 24s.** Used by 2 scenes.

### 1:39 → 1:48 · reads from 0s · pip

- **Framing:** a 499px inset in the top right — sit closer than feels natural
- **Over:** terminal — stingo taste "#ff7a18" --name Ember --save ember.json
- **Cutting from:** breathing room — Same script. Three taste profiles.
- **Cutting to:** camera

### 1:48 → 2:02 · reads from 10s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** terminal — stingo taste "#ff7a18" --name Ember --save ember.json
- **Cutting to:** title — "No browser anywhere"

> You give it one brand colour. It puts every neutral on a measured lightness ramp, bleeds a trace of your hue through them, and then lifts anything that fails the contrast floor — and tells you it did. A bad palette still produces a readable video.

*46 words in 14.0s — about 197 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 6. `06-pipeline.mp4`

**Record at least 16s.** Used by 1 scene.

### 2:16 → 2:32 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** diagram — what happens to one frame
- **Cutting to:** title — "A frame is a pure function"

> Everyone reaches for headless Chrome. I did not. Satori does real flexbox layout and hands back SVG, resvg turns that into pixels, and the pixels go straight down a pipe into ffmpeg. No browser process per frame. Thirty three milliseconds a frame at ten eighty by nineteen twenty.

*48 words in 16.0s — about 180 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 7. `07-pure.mp4`

**Record at least 24s.** Used by 2 scenes.

### 2:36 → 2:44 · reads from 0s · pip

- **Framing:** a 538px inset in the bottom right — sit closer than feels natural
- **Over:** code (ts) — Frame 4821 renders without rendering the 4820 before it.
- **Cutting from:** title — "A frame is a pure function"
- **Cutting to:** camera

### 2:44 → 2:59 · reads from 9s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** code (ts) — Frame 4821 renders without rendering the 4820 before it.
- **Cutting to:** list — What that one rule buys

> That one rule buys everything else. Scrubbing is instant, because any frame is one call. Rendering goes parallel, because no worker needs to know what another worker did. And the output is byte for byte the same every run.

*39 words in 15.0s — about 156 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 8. `08-beats.mp4`

**Record at least 14s.** Used by 1 scene.

### 3:19 → 3:33 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** terminal — stingo beats track.mp3
- **Cutting to:** stat — 100% of cuts on a downbeat

> It finds the beat itself. Spectral flux for the onsets, autocorrelation for the tempo, with a prior that stops it picking double or half time. Then every scene end snaps to a bar. I never place a cut.

*38 words in 14.0s — about 163 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 9. `09-perf.mp4`

**Record at least 25s.** Used by 2 scenes.

### 3:42 → 3:49 · reads from 0s · split

- **Framing:** about 653px wide, on the right — frame yourself off-centre toward that side
- **Over:** chart — milliseconds per frame
- **Cutting from:** title — "585ms to 33ms"
- **Cutting to:** camera

### 3:49 → 4:06 · reads from 8s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** chart — milliseconds per frame
- **Cutting to:** code (ts) — The entire fix.

> The big one was embarrassing. The rasteriser was scanning six hundred and forty nine system fonts on every single frame, and it needed none of them, because satori had already turned the text into paths. One flag. Four hundred and forty milliseconds.

*42 words in 17.0s — about 148 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 10. `10-camera.mp4`

**Record at least 38s.** Used by 3 scenes.

### 4:21 → 4:36 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** title — "Then I needed my own face"
- **Cutting to:** code (yaml) — Three layouts, chosen per scene.

> Which brings us to the shot you are looking at. Everything else here is generated from text. This is not. So the last thing I built was a camera block — and this frame is it, running.

*37 words in 15.0s — about 148 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

### 4:36 → 4:43 · reads from 16s · pip

- **Framing:** a 538px inset in the bottom right, circular crop — sit closer than feels natural
- **Over:** code (yaml) — Three layouts, chosen per scene.
- **Cutting from:** camera
- **Cutting to:** camera

### 4:43 → 4:57 · reads from 24s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** code (yaml) — Three layouts, chosen per scene.
- **Cutting to:** diagram — how a face gets into an SVG

> The take is never drawn into the SVG. It is pixels. So the renderer cuts a hole where my face goes and blends the decoded frame in underneath. Which layers get the hole is what decides whether I am over the code or behind the caption.

*46 words in 14.0s — about 197 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 11. `11-mcp.mp4`

**Record at least 26s.** Used by 2 scenes.

### 5:16 → 5:32 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** title — "Then I let a model drive it"
- **Cutting to:** terminal — make me a five minute explainer on Go concurrency

> Because a video here is a small text file, a model can write one. That part is obvious. The part that matters is that it can render a single frame and get the picture back — so it can see what it wrote, and fix it, before committing to a render.

*51 words in 16.0s — about 191 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

### 5:32 → 5:41 · reads from 17s · pip

- **Framing:** a 499px inset in the top right — sit closer than feels natural
- **Over:** terminal — make me a five minute explainer on Go concurrency
- **Cutting from:** camera
- **Cutting to:** statement — "A schema cannot tell you a headline wrapped badly."

---

## 12. `12-claude.mp4`

**Record at least 18s.** Used by 1 scene.

### 5:48 → 6:06 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** title — "I did not write any of this"
- **Cutting to:** list — What that does and does not mean

> Every line of this — the renderer, the beat detection, the tests, the documentation — was written by Claude, working from my direction. I decided what it should do and what good meant. It did the building. I would rather say that up front than have somebody find it in the commit log.

*53 words in 18.0s — about 177 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 13. `13-bugs.mp4`

**Record at least 32s.** Used by 2 scenes.

### 6:16 → 6:35 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** title — "Three things broke on launch night"
- **Cutting to:** stat — 0 of those threw an error

> One: an entire block type rendered a blank white window, because the rasteriser cannot decode WebP and says nothing when it fails. Two: the published types resolved to nothing, so the whole API quietly became "any". Three: an unknown command exited zero, which would have passed silently in anybody's CI.

*50 words in 19.0s — about 158 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

### 6:40 → 6:52 · reads from 20s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** stat — 0 of those threw an error
- **Cutting to:** terminal — npm publish

> And then npm refused the name. Stingo is two letters away from string, so it read as typosquatting. That is why it installs under a scope.

*26 words in 12.0s — about 130 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## 14. `14-outro.mp4`

**Record at least 13s.** Used by 1 scene.

### 7:14 → 7:27 · reads from 0s · full

- **Framing:** fills the frame (1920×1080) — anything smaller is upscaled
- **Cutting from:** terminal — bun add @hersidev/stingo
- **Cutting to:** outro — stingo

> It is on npm, the source is on GitHub, and the script for this exact video is in the examples folder. If you make something with it, I would genuinely like to see it.

*34 words in 13.0s — about 157 wpm. Say it your way; if you run long, delete this scene's `dur:`.*

---

## When the takes exist

```bash
stingo takes  examples/building-stingo/video.yaml      # resolution, fps, length, audio
stingo render examples/building-stingo/video.yaml --draft
stingo render examples/building-stingo/video.yaml
```

Delete a scene's `dur:` once its take is shot and the scene runs as long
as you actually spoke.
