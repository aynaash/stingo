A video document is YAML, JSON, or a TypeScript module. It says what the film
is called, what shape it is, which taste profile it wears, what it sounds like,
whether it is captioned — and, the bulk of it, the scenes.

```yaml
title: Concurrency in Go, in five minutes
canvas: { preset: vertical, fps: 30 }
taste: ./taste.json
audio:
  music: assets/music/loop128.mp3
  bpm: auto
scenes:
  - block: title
    text: Your program is waiting
```

## title

The film's name. Shown by `plan` and `render`, and used for the default output
filename. Defaults to `untitled`.

## canvas

```yaml
canvas: { preset: vertical, fps: 30 }
canvas: { width: 1440, height: 1080, fps: 24 }
```

| Field | Type | Default | |
|---|---|---|---|
| `preset` | `vertical` · `horizontal` · `square` | — | 1080×1920, 1920×1080, 1080×1080 |
| `width` | integer | `1080` | overrides the preset |
| `height` | integer | `1920` | overrides the preset |
| `fps` | integer | `30` | |

Orientation is derived from the dimensions, not declared, and every block sizes
itself from it. The same script renders to any shape without a second layout.

`--vertical`, `--horizontal` and `--square` override the canvas per command,
which is how one script produces both a YouTube cut and a reel.

## taste

Either the name of a built-in profile, a path to a taste file, or a profile
written inline.

```yaml
taste: bootdev        # built-in
taste: ./taste.json   # relative to this document
```

See [taste profiles](taste). `--taste` overrides it per command.

## audio

```yaml
audio:
  music: assets/music/loop128.mp3
  bpm: auto
  musicGainDb: -19
  vo: narration.m4a
```

| Field | Type | Default | |
|---|---|---|---|
| `music` | path | — | the bed; also sets the beat grid |
| `bpm` | number · `auto` | `auto` | `auto` detects it |
| `musicGainDb` | number | `-18` | lower it when there is speech |
| `vo` | path | — | a narration track for the whole film |

Paths resolve next to the document first, then against the working directory.

Pointing at music does two things: it mixes the bed, and it sets the grid that
scene ends snap to. Run `stingo beats <file>` to see what was detected before
committing to a render.

Music is looped or trimmed to length, faded at both ends, ducked under any
speech by a sidechain compressor, and normalised to the taste's target
loudness — −14 LUFS by default, which is what the platforms want.

## captions

```yaml
captions:
  enabled: true
  burn: true
```

| Field | Type | Default | |
|---|---|---|---|
| `enabled` | boolean | `false` | off unless you ask for it |
| `burn` | boolean | `true` | draw them into the frame |
| `style` | `word` · `line` | `word` | accepted by the schema, not read yet |

Captions come from the `say` field on each scene — there is no second script to
keep in sync. Words are spread across the scene at the taste's
`wordsPerMinute`, grouped into short chunks, and drawn above the platform safe
area with the word being spoken picked out.

This is **estimated timing, not forced alignment**. It tracks text-to-speech
generated from the same words; against a recorded take it will drift.

Whenever `enabled` is set, `.srt` and `.vtt` sidecars are written beside the
MP4 — burned in or not, because a burned-in caption is invisible to search. If
no scene carries a `say`, `render` says so and writes nothing.

From TypeScript, `.captions()` on the film builder turns them on.

## scenes

An ordered list. Every scene declares its `block`, and every block accepts
these in addition to its own fields:

| Field | Type | |
|---|---|---|
| `block` | string | which renderer draws it — see [blocks](blocks) |
| `id` | string | a stable name, shown in `plan` |
| `dur` | time | override the inferred length |
| `at` | time | pin an absolute start instead of following the previous scene |
| `say` | string | narration text; drives the length estimate |
| `bg` | b-roll | the animated background layer |
| `enter` / `exit` | animation | override the taste's motion for this scene |
| `camera` | camera | a recorded take — see [talking head](camera) |
| `cut` | `free` · `beat` · `bar` | override the taste's snapping for this scene |
| `note` | string | a comment that travels with the scene |

### Time values

Anywhere a duration is accepted:

| Form | Means |
|---|---|
| `4` | four seconds |
| `"4s"` | four seconds |
| `"8b"` | eight beats, at the detected tempo |
| `"2bar"` | two bars |
| `"1:30"` | ninety seconds |

Musical units are the useful ones. `dur: 8b` stays eight beats whatever tempo
the track turns out to be.

## How a scene gets its length

In order:

1. **`dur`, if you set one.** Nothing else applies.
2. **`say`, if present.** Word count at the taste's `wordsPerMinute`, plus a
   breath.
3. **The block's default,** raised by what is actually on screen — lines of
   code, number of list items, length of terminal output.

Then it is clamped to the taste's `sceneMin` and `sceneMax`, and the scene
*end* is snapped to the grid, so cuts land on the music rather than wherever
the text happened to run out.

Two exceptions, both about speech:

- A `camera` scene takes its length from the take and is **not** clamped —
  pacing bounds exist to stop a caption lingering, not to cut a sentence short.
- A `camera` scene cuts `free` by default, because snapping speech to a
  downbeat clips the last word. Set `cut: bar` to opt back in.

## B-roll

Every scene sits on an animated, procedurally generated background. No footage,
deterministic from a seed.

```yaml
bg: { kind: orbits, opacity: 0.55, speed: 0.8, seed: 3 }
```

| Field | Type | Default | |
|---|---|---|---|
| `kind` | see below | `grid` | which generator |
| `seed` | integer | `1` | same seed, same background, always |
| `speed` | number | `1` | |
| `density` | 0–2 | `1` | |
| `opacity` | 0–1 | `0.5` | |
| `color` / `color2` | hex | palette | override the palette for this layer |
| `drift` | number | `0.04` | slow push-in across the scene |

`grid` · `dots` · `waves` · `particles` · `codeRain` · `orbits` · `mesh` ·
`beams` · `terrain` · `pulse` · `noise` · `none`

Leave `bg` off and each block picks a sensible default, so a scene never sits
on flat colour.

## Entrance and exit

```yaml
enter: { kind: rise, delay: 0.1 }
exit:  { kind: fade }
```

`fade` · `rise` · `fall` · `pop` · `slideL` · `slideR` · `wipe` ·
`typewriter` · `blur` · `none`

Duration and easing come from the taste's motion personality unless you set
`dur` or `ease` here. Usually you should not — that is what makes a film hold
together.

## Writing it in TypeScript

A document can be a module that default-exports a film. You get types, loops,
and real composition instead of hand-written YAML:

```ts
import { film, title, code, list, outro } from '@hersidev/stingo';

const MISTAKES = [
  'A goroutine nobody receives from leaks forever',
  'Unsynchronised writes are a race, not a visible bug',
];

export default film('Concurrency in Go')
  .vertical()
  .taste('bootdev')
  .music('assets/music/loop128.mp3', { bpm: 'auto' })
  .add(
    title('Your program is waiting').kicker('concurrency'),

    code('go', 'go download("a.txt")')
      .highlight(1)
      .caption('This runs concurrently.'),

    // scenes are ordinary values, so ordinary code composes them
    list(...MISTAKES).title('Two ways to get hurt'),

    outro('Now go write something concurrent').handle('@stingo'),
  );
```

Every block has a constructor — `title`, `statement`, `code`, `terminal`,
`stat`, `list`, `chart`, `diagram`, `image`, `quote`, `compare`, `broll`,
`camera`, `outro` — and
the shared scene options (`dur`, `at`, `id`, `say`, `bg`, `enter`, `exit`,
`camera`, `cut`) are methods on all of them.

```bash
bun stingo render film.ts
```
