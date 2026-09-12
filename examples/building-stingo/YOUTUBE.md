# Publishing it

Everything needed to upload. Thumbnails are in [`thumbnails/`](./thumbnails) —
lead with `thumb-c.png`.

---

## Title

Pick one. The first is the strongest: it is the only claim on the page nobody
else can make.

1. **I didn't write a line of this video tool. I built it anyway.**
2. **I made a video tool where the video is a text file**
3. **Rendering video without a browser — 33ms a frame**

Keep it under 60 characters where you can, so it does not truncate on mobile.

---

## Description

Paste from here down.

```
I got tired of dragging rectangles around a timeline, so I made the video a
text file. This one is the text file.

stingo takes a script and a taste profile and renders an MP4 — every cut
landing on a downbeat, no timeline, no editor, and no browser anywhere in the
pipeline. satori does the layout, resvg turns it into pixels, ffmpeg takes it
from there. About 33 milliseconds a frame at 1080x1920.

And every line of it was written by Claude. I decided what it should do and
what good meant; the model did the building. This video says that out loud
because it is the most interesting thing about the project, not something to
bury in a footnote.

CHAPTERS
0:00  A video is a text file
1:09  A video is two files
2:02  No browser anywhere
2:32  A frame is a pure function
3:06  Cuts land on the music
3:38  585ms to 33ms
4:17  Then I needed my own face
5:13  Then I let a model drive it
5:44  I did not write any of this
6:12  Three things broke on launch night
7:27  Where to get it

LINKS
Source        https://github.com/aynaash/stingo
Docs          https://aynaash.github.io/stingo/
npm           https://www.npmjs.com/package/@hersidev/stingo
The script    https://github.com/aynaash/stingo/tree/main/examples/building-stingo

The script for this exact video is in that last link, along with the shot list
it was recorded from. Both are generated from the same file the video is.

INSTALL
  bun add @hersidev/stingo

Needs Bun 1.3+ and ffmpeg 6+ on your PATH.

WHAT IT DOES NOT DO, SO YOU FIND OUT FROM ME
- Bun only. ffmpeg is a hard requirement, not optional.
- Image-heavy scenes cost about 350ms a frame against 33ms for text.
- Four of the six transitions are accepted by the schema and render as cuts.
- Captions are estimated from the script, not force-aligned to my voice.
- v0.1. The schema is the part you'd depend on, and it will change.

"Stingo" is Sheng — the Swahili-English creole spoken in Nairobi — for
aesthetics. Which is the idea: the look of a film is a thing you can name, keep
in its own file, and swap.

AGPL-3.0.
```

---

## Chapter timings

The list above is approximate. Regenerate exact ones from the cut:

```bash
bun stingo plan examples/building-stingo/video.yaml
```

Take the start time of each `title` scene — those are the chapter boundaries by
construction. YouTube needs the first chapter at `0:00` and at least three
chapters, each a minimum of ten seconds.

---

## Pinned comment

```
The script for this video is in the repo, and so is the shot list I read
from — both generated from the same file the video is:
github.com/aynaash/stingo/tree/main/examples/building-stingo

Happy to answer anything about the rendering pipeline or the part where a
model wrote all of it.
```

---

## Tags

```
programming, software engineering, video, ffmpeg, typescript, bun, open source,
developer tools, ai coding, claude, content creation, motion graphics, svg,
video editing, automation
```

---

## Before you hit publish

- [ ] Thumbnail checked **at 360px wide**, not full size
- [ ] Chapters start at `0:00` and none is under ten seconds
- [ ] Captions uploaded — `.srt` renders beside the MP4
- [ ] The four limitations above are still true (re-read them; they change)
- [ ] Links resolve, especially the npm one, which is **scoped**
