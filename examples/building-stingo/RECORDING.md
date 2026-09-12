# Recording the takes

The edit is already finished. `stingo plan` prints the cut and `stingo preview`
scrubs it with every take still missing — so you record to fit a locked edit,
rather than cutting around whatever you happened to shoot.

```bash
stingo plan   examples/building-stingo/video.yaml    # the cut, no footage
stingo render examples/building-stingo/video.yaml --no-camera   # watchable rough
```

The rough render is worth watching before you shoot anything. Each camera scene
draws a placeholder with the timecode it would be reading, so you can see the
shape of the thing and hear where the music lands.

## What to shoot

**[SHOOT.md](./SHOOT.md) is the sheet to work from.** It is generated from the
script, so it cannot drift: every take in order, what to say, how long, how
close to sit, and what it cuts into either side.

```bash
bun run tools/shootlist.ts examples/building-stingo/video.yaml -o SHOOT.md
bun run tools/shootlist.ts examples/building-stingo/reel.yaml  -o SHOOT-REEL.md
```

Re-run it whenever the script changes.

## The long video at a glance

Fourteen takes, one file each, named to match `src:` in `video.yaml`.

| Take | Roughly |
|---|---|
| `01-hook.mp4` | the hook, straight down the lens |
| `02-problem.mp4` | why timeline editing is bookkeeping |
| `03-wish.mp4` | "I wanted a diff" |
| `04-two-files.mp4` | script vs taste, and what the name means |
| `05-taste.mp4` | one colour in, a whole palette out |
| `06-pipeline.mp4` | no browser: satori, resvg, ffmpeg |
| `07-pure.mp4` | a frame is a pure function |
| `08-beats.mp4` | it finds the beat itself |
| `09-perf.mp4` | 585 ms to 33 ms, and the font flag |
| `10-camera.mp4` | the camera block — this shot, explaining itself |
| `11-mcp.mp4` | letting a model drive it, and giving it eyes |
| `12-claude.mp4` | who actually wrote this |
| `13-bugs.mp4` | three silent bugs, and npm refusing the name |
| `14-outro.mp4` | it is out, go make something |

Several takes are read from twice — a later scene picks up further into the same
file with `from:`. Shoot each as **one continuous take**; do not cut between the
halves. SHOOT.md states the minimum length for each, computed from where the
last scene reads to.

## And the reel

Four more, shot **vertical**: `reel-01-hook`, `reel-02-two`, `reel-03-ai`,
`reel-04-close`. Six to eight seconds each. Stand closer and talk faster — a
reel has no room for a run-up.

## The `say:` field is not a teleprompter

Every camera scene carries a `say:`. It does two jobs: it sets how long the
scene runs, and it states what the scene is *for*. Say it your way. If your
version runs longer, delete that scene's `dur:` and the scene takes its length
from your take instead.

## Framing

Shoot the long video **horizontal, 1920×1080 or larger**. Shoot the reel
vertical if you can.

The box a take lands in decides how close you sit:

- **full** fills 1920×1080. Anything smaller is upscaled.
- **pip** is about 26–32% of frame width — roughly 500–600 px. Sit closer than
  feels natural; at inset size a wide shot is a dot.
- **split** takes 34–45% of the width. Frame yourself off-centre, toward the
  side the take sits on, so you are not looking out of the panel.

Leave headroom. `zoom`, `offsetX` and `offsetY` reframe afterwards, but they
cannot invent picture outside what you shot.

## Sound

**Record clean audio into the same file as the picture.** stingo trims each take
to its scene, delays it to the right position on the timeline, ducks the music
underneath it and normalises the result. There is no manual sync step — which
only works if picture and sound are one file.

A separate recorder puts you back in the business of lining up two files, which
is the thing this is meant to avoid.

If a take's sound is unusable, set `mute: true` on that scene and put the words
in `audio.vo` instead.

## On an iPhone

A phone on a stand is enough. What matters is what it hands you afterwards.

**Settings, once:**

- *Settings → Camera → Formats → **Most Compatible***. The default is HEVC, which
  decodes several times slower per frame — and a render touches every frame of
  every take. `stingo ingest` transcodes anyway, but this saves it work.
- *Record Video → **1080p at 30 fps***. 4K gives you nothing here: the long video
  is 1920×1080, so 4K is downscaled and only costs transfer time. 30 fps matches
  the project's frame rate; 60 gets thrown away.
- **Cinematic mode off.** It fakes depth of field and racks focus on its own,
  usually to the wrong thing.

**Before each take:** press and hold on your face until *AE/AF LOCK* appears.
Without it the phone rebalances exposure mid-sentence and the cut shows it.

**Position.** Lens at eye height, not below — a phone on a low stand shoots up
your nose. Sit close: `pip` scenes land in a ~500 px inset, so a wide shot is a
dot. Frame as the shot list says for each take.

**Sound.** The phone's mic is fine at arm's length in a quiet room with soft
things in it. Wired earbuds with a mic are better and cost nothing. What kills a
take is reverb — a bare room with hard walls cannot be fixed afterwards. Record
one test take and listen on headphones before shooting all fourteen.

**Shoot in shot-list order** and keep one file per take. Delete bad attempts on
the phone, so what lands on the machine is the keepers in order.

**Then bring them over** — AirDrop, or a cable — into any folder, and:

```bash
bun run tools/ingest.ts examples/building-stingo/video.yaml ~/Desktop/takes
```

That prints the plan: which clip becomes which take, and whether any is shorter
than its scene needs. Nothing is written until you add `--apply`, which bakes the
rotation in, crops to frame size, and re-encodes to H.264 with 48 kHz audio.

## Before you commit to a render

```bash
stingo takes examples/building-stingo/video.yaml
```

Reports every take's resolution, frame rate, length and whether it carries
audio, and warns when a take is shorter than the scenes reading from it, was
shot below the box it feeds, or recorded slower than the canvas.

## Letting your takes set the pace

Every camera scene has an explicit `dur:`. That is scaffolding, so the edit
could be planned before any footage existed. **Delete a scene's `dur:` once its
take is shot** and the scene runs exactly as long as you actually spoke —
pacing limits do not apply to speech, and camera scenes cut free rather than
snapping to a downbeat, so your last word is never clipped.

That is why the script plans to about seven and a half minutes now and will land
near eight once the real takes are in.

## Rendering it

```bash
# once the takes exist
stingo render examples/building-stingo/video.yaml
stingo render examples/building-stingo/reel.yaml

# a faster pass while you are still cutting
stingo render examples/building-stingo/video.yaml --draft
```

Captions are on, so `.srt` and `.vtt` land beside the MP4. Word timing is
estimated from `say:`, not force-aligned to your voice — if a caption drifts
against what you actually said, edit that scene's `say:` to match the take.
