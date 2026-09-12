# The demo — what to record

About fifty seconds, horizontal. You record **two things**.

## 1. One voiceover, read straight through

Record audio only — Voice Memos is fine. Read these seven lines in order, with
a natural pause between them. Roughly 47 seconds at a normal pace; don't rush
to hit it, the scenes stretch to fit what you actually say.

> **1.** Every video you have seen about code was made by dragging rectangles around a timeline. I got tired of that.
>
> **2.** So the video became a text file. This is the whole thing — scenes, in order.
>
> **3.** What it looks like is not in there at all.
>
> **4.** One file says what you are saying. Another says what it looks like. Swap the second and the same script becomes a different film.
>
> **5.** Every cut you are watching landed on a beat of the track, because the script knows the tempo.
>
> **6.** Thirty-three milliseconds a frame. A five minute film renders in about a minute.
>
> **7.** And this video, the one you are watching, was made by the thing it is about.

Export it as `examples/demo/takes/vo.m4a`. One file, one take — if you fluff a
line, pause and say it again; we cut to the good one.

## 2. Three short takes of you talking

**These are picture only.** Every camera scene is `mute: true`, because the
voiceover already carries the words. So say whatever you like while recording —
count, read the line, talk about your day. What matters is that you look like
someone explaining something.

| File | Length | Framing |
|---|---|---|
| `takes/01-hook.mp4` | **12s+** | fills the frame — head and shoulders, eye height |
| `takes/02-beat.mp4` | **10s+** | a ~576px circular inset, bottom right — **sit closer than feels natural** |
| `takes/03-close.mp4` | **10s+** | fills the frame again |

Horizontal. 1080p30. Lock AE/AF before each. See
[RECORDING.md](../building-stingo/RECORDING.md) for the phone settings.

## 3. Then

```bash
bun run tools/ingest.ts examples/demo/video.yaml ~/Desktop/clips --apply
cp ~/Desktop/vo.m4a examples/demo/takes/vo.m4a

bun stingo still  examples/demo/video.yaml --at 3 -o check.png   # look before rendering
bun stingo render examples/demo/video.yaml -o out/demo.mp4
```

`SHOOT.md` in this folder is the generated sheet — same lines, plus what each
take cuts into. Re-run `tools/shootlist.ts` if the script changes.
