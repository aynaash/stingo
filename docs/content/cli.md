Every command takes a video document except `beats` (an audio file), `taste` (a
brand colour), `doctor` (a taste name or path), and `blocks` and `tastes`
(nothing, or one block name).

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

## still

```bash
stingo still <doc> --at 12.5 -o frame.png
stingo still <doc> --frame 375 -o frame.png
```

One frame, through the same pixel path as a render — same fonts, same texture
pass, same camera compositing. The fastest way to check a layout, and it prints
which scene the frame landed in.

## plan

```bash
stingo plan <doc>
```

Resolves the entire timeline and prints it, rendering nothing. Shows each
scene's start, end, duration in seconds and in beats, and marks scenes carrying
a camera take.

Use it before every long render. Finding out a scene is two seconds too short
costs one second here and several minutes there.

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
stingo doctor <taste>
```

Audits a profile against the house contrast floors — body 7:1, muted 4.5:1,
accents 4.5:1 — and says which failures stingo repairs automatically at render
time.

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
| `--at <seconds>` | which time, for `still` |
| `--frame <n>` | which frame, for `still` |
| `--port <n>` | preview server port |
| `--debug` | print a stack trace on failure |
