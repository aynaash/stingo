A block is a scene type. Every one sizes itself from the stage, so the same
script renders to any canvas shape without a second layout.

All of them accept the [shared scene fields](script#scenes) — `dur`, `say`,
`bg`, `camera`, and the rest.

## title

A kicker, a headline that animates in word by word, and an optional subtitle.

```yaml
- block: title
  kicker: chapter one
  text: Threads are expensive
  sub: A megabyte each, reserved up front.
  align: center        # or left
```

Words arriving individually is what makes a title feel authored rather than
typeset. It is the single highest-leverage motion detail in the system.

## statement

One line, large, with chosen words in the accent colour.

```yaml
- block: statement
  text: Waiting is not working.
  emphasis: [working.]
```

`emphasis` matches whole words, punctuation included — write `working.` to
catch the word with its full stop.

## code

![A code block with three highlighted lines](assets/img/block-code.webp)

```yaml
- block: code
  lang: go
  caption: Send on one side, receive on the other.
  highlight: [2, 3, 4]
  reveal: lines        # all | lines | typewriter
  code: |
    ch := make(chan string)
    go func() { ch <- "done" }()
    msg := <-ch
```

Use `file: ./main.go` instead of `code:` to pull source from disk, so samples
stay in step with code that actually compiles.

Highlighted lines are 1-based. Highlighting is done by Shiki, so anything it
supports works as a `lang`.

## terminal

![A terminal window with commands and their output](assets/img/block-terminal.webp)

```yaml
- block: terminal
  title: bash
  lines:
    - { prompt: "$", cmd: "stingo beats track.mp3" }
    - { out: "tempo      128.9 BPM (confidence 91%)" }
    - { out: "downbeat   0.371s" }
```

Commands type in; output appears after them. `delay` on a line holds it back.

## stat

![A large figure with a label and a supporting line](assets/img/block-stat.webp)

```yaml
- block: stat
  value: "99%"
  label: of a web request
  sub: is spent waiting on something else.
  countFrom: "0%"      # counts up on entry
```

## list

![A titled list with arrow markers](assets/img/block-list.webp)

```yaml
- block: list
  title: Three ways to get hurt
  marker: arrow        # num | dot | arrow | check
  items:
    - A goroutine nobody receives from leaks forever
    - Unsynchronised writes are a race, not a visible bug
```

Items stagger in. Length is inferred from the item count, so a long list gets
the time to be read.

## chart

```yaml
- block: chart
  kind: bar            # bar | line
  title: stack size at birth
  unit: " KB"
  highlightIndex: 1
  data:
    - { label: OS thread, value: 1024 }
    - { label: goroutine, value: 2 }
```

Bars grow from zero on entry; the highlighted index takes the accent colour.
Paths are built with `d3-shape` and hand-written into the SVG.

## compare

```yaml
- block: compare
  left:  { title: OS thread, items: ["1 MB stack", "Kernel schedules it"] }
  right: { title: goroutine, items: ["2 KB stack", "Go runtime schedules it"] }
```

Two panels: side by side in landscape, stacked in portrait. The block does not
decide which — the stage does.

## quote

```yaml
- block: quote
  text: Do not communicate by sharing memory; share memory by communicating.
  attrib: Rob Pike
```

## broll

A background with nothing on it but an optional caption. Useful as a beat of
breathing room between chapters.

```yaml
- block: broll
  caption: Same script. Three taste profiles.
  bg: { kind: orbits, opacity: 0.75 }
```

## camera

A recorded take. Covered in full on [talking head](camera).

```yaml
- block: camera
  camera: { src: takes/01-hook.mp4, layout: full, scrim: 0.2 }
  lower: { name: Hersi, role: hersietech.com }
  caption: The hook, straight down the lens.
```

## outro

```yaml
- block: outro
  text: stingo
  sub: Declarative video for people who ship content.
  handle: github.com/aynaash/stingo
```

## Adding your own

A block is a function from `(scene, ctx) → El`. Four things make one land:

1. **Size everything from `ctx.stage`**, never from raw pixels. That is what
   makes it work in portrait, landscape, square, and inside a split-screen
   panel, without knowing which it is in.
2. **Use `T.*` for type sizes**, so it sits on the same modular scale as
   everything else.
3. **Animate with `lifecycle()`**, so the taste's motion personality applies.
4. **Register it** in `blocks/src/registry.ts`, add it to the schema union in
   `schema/src/video.ts`, and give it a `DEFAULT_DUR` entry in
   `film/src/plan.ts`.

See [contributing](https://github.com/aynaash/stingo/blob/main/CONTRIBUTING.md).
