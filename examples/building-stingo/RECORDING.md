# Recording the takes

The script is finished before the camera comes out. `stingo plan` prints the cut
and `stingo preview` scrubs it, both with the takes missing — so the edit is
locked first and you record to fit it, not the other way round.

```bash
stingo plan   examples/building-stingo/video.yaml    # the cut, no footage
stingo render examples/building-stingo/video.yaml --no-camera   # watchable rough
```

## What to shoot

One file per camera scene, named to match `src:` in the script:

| Take | Scene | Roughly |
|---|---|---|
| `01-hook.mp4` | cold open | the hook, straight down the lens |
| `02-problem.mp4` | the problem | why timeline editing is bookkeeping |
| `03-wish.mp4` | the wish | "I wanted a diff" |
| `04-two-files.mp4` | the idea | script vs taste |
| `05-pure.mp4` | pure functions | why one constraint buys everything |
| `06-satori.mp4` | layout | satori and resvg |
| `07-beats.mp4` | the beat grid | onsets, tempo, snapping |
| `08-perf.mp4` | performance | the 585 → 33 story |
| `09-camera.mp4` | the camera block | this feature, in this shot |
| `10-outro.mp4` | close | open source, the ask |

Plus three short ones for the reel: `reel-01-hook`, `reel-02-two`, `reel-03-close`.

The `say:` field on each camera scene is what that take is about. It is not a
teleprompter — it is there so the planner can estimate length and so you know
what the scene is for. Say it your way.

## Framing

Shoot **horizontal 1920×1080 or larger** for `video.yaml`, and record the reel
takes **vertical** if you can. The numbers that matter:

- **Full-frame scenes** fill 1920×1080. Anything smaller gets upscaled.
- **Pip scenes** use about 28% of the frame width — roughly 540px wide. Sit
  closer than feels natural; at pip size a wide shot is a dot.
- **Split scenes** take 34–38% of the width. Frame yourself off-centre, toward
  the side the camera sits on, so you are not looking out of the panel.

Leave headroom. `zoom`, `offsetX` and `offsetY` can push in and reframe after
the fact, but they cannot invent picture outside what you shot.

## Sound

The take's own audio is what you hear — `stingo` trims each take to its scene,
delays it to the right timeline position, ducks the music underneath it, and
normalises the result to −14 LUFS. There is no manual sync step.

So: **record clean audio into the same file as the picture.** A separate
recorder means aligning it yourself, which is the thing this is meant to avoid.

If a take has no usable sound, set `mute: true` on that scene and put the words
in `audio.vo` instead.

## Checking before you commit to a render

```bash
stingo takes examples/building-stingo/video.yaml
```

Reports every take's resolution, frame rate, duration and whether it carries
audio, and warns when a take is shorter than the scene reading from it, shot
below the box it feeds, or recorded at a lower frame rate than the canvas.

## Letting the takes set the pace

Every camera scene in the script has an explicit `dur:`. That is scaffolding for
planning without footage. Once a take exists, **delete its `dur:`** and the
scene runs exactly as long as the take does — pacing limits do not apply to
speech, and camera scenes cut free rather than snapping to a downbeat, so your
last word never gets clipped.

That is also why the script plans to about five minutes right now and will land
near eight once the real takes are in.
