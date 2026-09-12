# Thumbnails

Rendered by stingo, from `../thumbnail.yaml`. YouTube wants 1280×720.

```bash
stingo still ../thumbnail.yaml --at 1 -o thumb-a.png --no-hud   # the claim
stingo still ../thumbnail.yaml --at 5 -o thumb-b.png --no-hud   # the number
stingo still ../thumbnail.yaml --at 9 -o thumb-c.png --no-hud   # the Claude angle
```

`thumbnail.taste.json` is the film's taste with three changes, all because a
thumbnail is a different medium from a film: type at double scale, grain almost
off, vignette up to push the eye inward. Every scene sets `plain: true`, which
drops the anchored composition and the furniture — a scene numeral orients a
viewer through eight minutes and is pure clutter in a still.

**Judge them small.** A thumbnail is read at about 350px wide in a sidebar. If
it does not survive being shrunk to a thumbnail of itself, it is the wrong
thumbnail:

```bash
ffmpeg -i thumb-c.png -vf scale=360:-2 /tmp/check.png
```

`thumb-c` is the one to lead with. "I did not write a line of this" is the only
claim here nobody else can make.
