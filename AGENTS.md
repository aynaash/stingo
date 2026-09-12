# Working on stingo, or making videos with it

Notes for a coding agent. Two separate jobs live in this repository — using
stingo to make a video, and changing stingo itself.

---

## Making a video

The MCP server in `packages/mcp` gives you the whole loop. `.mcp.json` at the
repository root points at it, so a client that reads that file has it already.
Without MCP, the CLI does the same things: `bun stingo <command>`.

### The loop that works

1. **`stingo_docs`** — read the page before guessing at a field. `script` for
   document structure, `blocks` for scene types, `taste` for the look, `camera`
   for talking-head takes.
2. **`stingo_validate`** — instant, catches most mistakes.
3. **`stingo_plan`** — the resolved timeline. Check pacing here, not after a
   five-minute render.
4. **`stingo_still`** — render one frame **and look at it**. This is the step
   that separates a script that validates from a script that reads.
5. **`stingo_render`** — only once frames look right. Use `draft: true` while
   iterating.

Without MCP the same loop is `stingo doctor` → `stingo plan` → `stingo still`
→ `stingo sheet` → `stingo render`. `doctor` is the one to reach for first on a
script you did not write: it checks ffmpeg, fonts, taste, music, takes, images,
timing, narration fit and text fit in one pass and names a fix for each failure,
rather than surfacing one problem per run.

### Things that are true and not obvious

- **Look at frames.** A schema cannot tell you a headline wrapped badly, a
  highlighted chart bar is invisible against its background, or a scene is over
  before anyone could read it. One `stingo_still` call costs a second.
- **Look at all of them at once.** `stingo sheet <doc> -o sheet.png` puts one
  frame per scene in a grid. Three dark scenes in a row and two scenes saying
  the same thing are invisible one still at a time and obvious in a grid.
- **`stingo still --guides`** overlays the title-safe box and the zones each
  platform covers with its own interface. Text under the Shorts right rail
  renders perfectly and is unreadable in the app.
- **Never set colours in a script.** Colour lives in the taste profile. If a
  script contains a hex code, that is a bug. Derive a profile instead:
  `stingo_derive_taste { brand: "#ff7a18" }`.
- **Do not set `dur` first.** Length is inferred from content — lines of code,
  number of list items, the `say:` text — then clamped by the taste's pacing and
  snapped to the beat grid. Set `dur` only when the inferred length is wrong.
- **Write `say:` even with no narration recorded.** It drives the length
  estimate and gives the scene a stated purpose. `plan` warns when a `say` needs
  more seconds than its scene has, with how many words to cut — an explicit
  `dur`, the taste's `sceneMax`, a camera take's own length or a snapped cut can
  all make the words no longer fit.
- **Scripts work before footage exists.** Camera scenes plan and preview with
  `takes/` empty; `noCamera: true` renders placeholders carrying the source
  timecode. Lock the edit first, shoot to fit it.
- **Vertical is 1080×1920 and horizontal is 1920×1080**, from the same script.
  Blocks size themselves from the stage; there is no second layout to write.

### A first script

```yaml
title: What a channel actually is
canvas: { preset: vertical, fps: 30 }
taste: bootdev

scenes:
  - block: title
    kicker: concurrency
    text: A channel is a queue with a lock
    say: Everyone describes channels as magic. They are a queue with a lock.

  - block: code
    lang: go
    caption: Send on one side, receive on the other.
    highlight: [2]
    code: |
      ch := make(chan string)
      go func() { ch <- "done" }()
      msg := <-ch
```

Then: validate, plan, still at a couple of times, render.

---

## Changing stingo itself

Read `README.md` first — the "Why it is built this way" section is the design.

### Constraints that are not negotiable

- **A frame is a pure function of its index.** Nothing may carry state between
  frames. Anything time-varying is derived from the frame number. This is what
  makes scrubbing, parallel rendering and deterministic output work, and
  breaking it breaks all three at once.
- **No full-frame SVG filters.** `feGaussianBlur` over two megapixels costs
  ~9.5 seconds per frame. Per-pixel effects go in a precomputed lookup applied
  to the RGBA buffer — see `render/texture.ts`.
- **Taste profiles set parameters; the house sets relationships.** Type ratios,
  contrast floors and spacing rhythm live in `themes/house.ts` and are not a
  taste's to override.
- **Blocks size from `ctx.stage`, never from raw pixels.** That is what makes a
  block work in portrait, landscape, square, and inside a split-screen panel
  without knowing which it is in.
- **Never write a two-value `gap`.** satori reads `gap: "11px 48px"` as a single
  value and applies the *first* to both axes, silently. Set `rowGap` and
  `columnGap`. This cost a real bug: headline words sat a fifth of a space apart
  and "It works" read as one word whose second half looked lighter, when both
  words were the same face at the same weight the whole time.

### Before you claim a speedup

Measure it, twice, on an unloaded machine. An earlier "optimisation" here —
halving worker count when decoding video — was committed on a noisy measurement
and reverted when a clean run showed 45 s, 49 s and 65 s for 8, 4 and 2 workers.
Check `uptime` before trusting a timing.

### Checks

```bash
bun test
bun run typecheck
bun run docs:build
```

Both of the first two run in CI on Linux and macOS.

### Adding a block

`CONTRIBUTING.md` has the steps. In short: size from the stage, use `T.*` for
type sizes, animate with `lifecycle()` so the taste's motion personality
applies, and register it.

### A warning about this repository

Several agents sometimes work here at once. Before concluding that a test
failure or an unexpected diff is yours, check whether someone else is mid-edit:

```bash
find packages test -name '*.ts' -mmin -15
git status --short
```

If another session is active, stage and commit only the files you actually
wrote — not `git add -A`.
