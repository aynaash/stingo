Every command takes a video document except `beats` (an audio file), `taste` (a
brand colour), and `blocks` and `tastes` (nothing, or one block name). `doctor`
takes either a document or a taste, and does something different with each.

## render

```bash
stingo render <doc> [-o out.mp4]
```

Renders the whole film. Frames are split into contiguous ranges across
processes; each worker encodes its own MP4 segment and the segments are
concatenated with stream copy, so no pixel data crosses a process boundary and
nothing is re-encoded.

Defaults to `out/<document name>.mp4`.

```bash
stingo render script.yaml --draft            # fast, ugly, for iterating
stingo render script.yaml --horizontal       # same script, different shape
stingo render script.yaml --taste dusk       # same script, different look
stingo render script.yaml --no-camera        # skip decoding footage
```

When the film has audio, the finished file is measured and the two numbers that
matter are printed: integrated loudness against the taste's target, and how far
the speech sits above the music bed.

```
    audio -14.2 LUFS · true peak -1.3 dBTP · speech +13.1 LU over music
```

Bad audio is what loses viewers, and it is the one fault a still cannot show
you — a frame can be checked by looking at it, a mix can only be checked by
listening to all of it, which nobody does on the tenth render. Speech below
about 8 LU over the bed gets a warning with how many dB to drop
`audio.musicGainDb` by. `--no-verify` skips the measurement.

## still

```bash
stingo still <doc> --at 12.5 -o frame.png
stingo still <doc> --frame 375 -o frame.png
```

One frame, through the same pixel path as a render — same fonts, same texture
pass, same camera compositing. The fastest way to check a layout, and it prints
which scene the frame landed in.

```bash
stingo still <doc> --at 12.5 --guides -o frame.png
```

`--guides` draws the title-safe and action-safe boxes over the frame, plus the
zones each platform covers with its own interface: in portrait, the column of
buttons up the right edge and the caption-and-handle strip along the bottom.
None of that furniture is in the frame you render, which is why a headline
parked under the Shorts right rail looks fine in a still and is unreadable in
the app — and you find out after publishing.

Anything you need read belongs inside the title-safe box and outside the red
zones. The overlay is never encoded into a video; it exists to be looked at.

## sheet

```bash
stingo sheet <doc> -o sheet.png
```

A contact sheet: one still from the middle of every scene, in a grid, labelled
with the scene id and its place on the timeline.

Nobody can hold a six-minute video in their head, and scrubbing is a serial
act — you see one moment at a time and have to remember the rest. Twelve frames
side by side is a different kind of looking. It is how you notice that three
scenes in a row are dark, that two of them say nearly the same thing, or that
the one bright scene is in the wrong place.

The frame is taken from the middle of each scene rather than the start, because
at frame zero every entrance is still animating and a sheet of first frames is
a sheet of half-drawn scenes.

```bash
stingo sheet <doc> --cols 4          # force the grid
stingo sheet <doc> --width 3000      # bigger thumbnails
stingo sheet <doc> --at 0.8          # later in each scene, 0..1
stingo sheet <doc> --no-camera       # placeholders instead of footage
```

## plan

```bash
stingo plan <doc>
```

Resolves the entire timeline and prints it, rendering nothing. Shows each
scene's start, end, duration in seconds and in beats, and marks scenes carrying
a camera take.

Use it before every long render. Finding out a scene is two seconds too short
costs one second here and several minutes there.

It also warns where a scene's `say` cannot be said in the time the scene has —
with how many words to cut — and prints the take budget: every camera scene and
the seconds of footage it needs.

```
  to camera 3 scenes · 0:21 of footage
  01-hook 8s · 02-broke 7s · 03-verdict 6s
```

That is the line to write down before you sit in front of the camera. `plan`
already knows how long each camera scene is; this is that arithmetic in a form
you can keep next to you while shooting.

A document whose `audio.music` does not exist still plans. `plan` renders
nothing and decodes nothing — it needs a tempo, not audio — so a missing track
is a warning, cuts fall back to free timing, and the command continues.
Snapping to a nominal 120 BPM that no track has would give you a plan that is
wrong in a way that looks right.

## preview

```bash
stingo preview <doc> [--port 4321]
```

A scrubbable preview at `localhost:4321` that re-plans when the document is
saved. Seeking is not a render — any frame is one function call — so the
scrubber is instant.

## takes

```bash
stingo takes <doc>
```

Every camera take the script references: resolution, frame rate, duration,
whether it carries audio, and which scenes read from it.

Warns when a take is shorter than the scenes using it, was shot below the box
it feeds, or was recorded at a lower frame rate than the canvas. See
[talking head](camera).

## beats

```bash
stingo beats <audio>
```

Tempo with a confidence score, the first downbeat, bar length, duration, onset
count and measured loudness. Prints the `audio:` block to paste into a
document.

Worth running before you commit to a track — if the confidence is low, set
`bpm` by hand.

## blocks

```bash
stingo blocks
stingo blocks camera
```

Every registered scene type and the fields it takes, generated from the schema
rather than written by hand. With a name, just that one.

## tastes

```bash
stingo tastes
```

Lists the built-in profiles with their motion personality, cut behaviour and
palette.

## taste

```bash
stingo taste "#ff7a18" --name Ember --save ember.json
```

Derives a complete profile from one brand colour: places it on a measured
lightness ramp, bleeds a trace of its hue into the neutrals, picks a support
hue by rotation, and lifts anything that fails the contrast floors — telling
you which ones it moved and why.

| Flag | Values | |
|---|---|---|
| `--mode` | `dark` · `light` | |
| `--mood` | `snappy` · `smooth` · `bouncy` · `mechanical` | motion personality |
| `--density` | `tight` · `normal` · `airy` | spacing and pacing |
| `--texture` | `clean` · `film` · `crt` · `flat` | grain, vignette, scanlines |
| `--support` | hex | second hue, instead of deriving one |
| `--cut` | `bar` · `beat` · `free` | |
| `--name` | string | |
| `--save` | path | write it out |

Without `--save` it prints the palette with contrast ratios and changes nothing.

## doctor

```bash
stingo doctor <doc>          # everything a render needs
stingo doctor <taste>        # the contrast audit
```

Given a **document**, it checks everything a render needs in one pass: ffmpeg
and its encoders, the font directory and whether the taste's three families are
really loaded at the weights it asks for, the taste itself, the music track and
whether a tempo can be found in it, every camera take and whether it is long
enough for the scenes reading from it, every image and backdrop source, the
timing, the narration fit, and whether the text fits its frames.

The reason it exists is arithmetic. A check that throws on the first problem
turns a session into one fix per run — install ffmpeg, run again, find the
missing track, run again, find the missing take. Five problems is five runs to
discover and five to confirm. Finding all of them at once costs the same work
and takes one run.

Every failing check names a fix, not just the fault:

```
  ✗ error  music     bed.mp3 does not exist
           → point `audio.music` at a track, or remove the `audio:` block
```

Errors exit **1** and warnings do not, so it works as a pre-publish check in a
script. A taste that will not resolve is reported as an error and the rest of
the report continues against the default, because the other things you have to
fix are worth knowing about in the same run.

Given a **taste** — a built-in name or a path — it audits that profile against
the house contrast floors: body 7:1, muted 4.5:1, accents 4.5:1, and says which
failures stingo repairs automatically at render time.

## version

```bash
stingo version
stingo --version
```

Prints the version and nothing else. An unknown command prints the help screen
and exits **1**, so a typo in a script fails rather than passing quietly.

## Scripts in the repo

Not `stingo` subcommands — these live in `tools/` and run from a checkout,
because they are about producing a film rather than rendering one.

```bash
bun run tools/shootlist.ts <doc> -o SHOOT.md    # the sheet you shoot from
bun run tools/ingest.ts <doc> <folder>          # phone clips → takes/
bun run tools/gallery.ts                        # every image in these docs
bun run tools/blockdocs.ts                      # the block reference
```

`shootlist` derives the shot list from the script: every camera scene in order,
what to say, how long, how close to sit, and what it cuts into. A list kept by
hand drifts within a day and then you record the wrong thing.

`ingest` maps a folder of clips onto the takes a script names, in recording
order. It prints the plan first — which clip becomes which take, whether any is
shorter than its scene needs — and writes nothing without `--apply`. Applying
bakes in the rotation a phone leaves in metadata, crops to the project's frame
size, and re-encodes to H.264 with 48 kHz audio.

`gallery` and `blockdocs` regenerate what is on this site. Both have a
`--check` mode that CI runs, so a screenshot or a field table cannot drift
away from the code.

## Flags

| Flag | |
|---|---|
| `-o`, `--out <file>` | output path |
| `--taste <name\|path>` | override the document's taste |
| `--vertical` | force 1080×1920 |
| `--horizontal` | force 1920×1080 |
| `--square` | force 1080×1080 |
| `--fps <n>` | override the frame rate |
| `--music <file>` | music bed; also sets the beat grid |
| `--bpm <n>` | force the tempo instead of detecting it |
| `--workers <n>` | parallel render processes; defaults to one per thread |
| `--crf <n>` | quality, lower is better (default 20) |
| `--preset <name>` | x264 preset (default `medium`) |
| `--draft` | `ultrafast` at crf 30, for iterating |
| `--no-camera` | draw camera placeholders instead of decoding footage |
| `--no-hud` | hide the progress bar and scene counter |
| `--no-verify` | skip measuring the finished mix |
| `--at <seconds>` | which time, for `still`; a 0–1 fraction for `sheet` |
| `--frame <n>` | which frame, for `still` |
| `--guides` | overlay safe areas and platform UI zones, for `still` |
| `--width <n>` | sheet width in pixels (default 2000) |
| `--cols <n>` | sheet columns; defaults to a grid chosen from the scene count |
| `--port <n>` | preview server port |
| `--debug` | print a stack trace on failure |
