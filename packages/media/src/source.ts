import { spawn, type Subprocess } from 'bun';
import { probeVideo, type VideoMeta } from './probe';

export interface Box { w: number; h: number }

export interface Framing {
  /** how the source fills the box */
  fit: 'cover' | 'contain';
  /** >1 pushes in past the fit, for reframing a head in shot */
  zoom: number;
  /** pan within the box, as a fraction of box size; +x right, +y down */
  offsetX: number;
  offsetY: number;
  /** mirror horizontally — matches what you saw in the webcam preview */
  mirror: boolean;
}

export const DEFAULT_FRAMING: Framing = { fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, mirror: false };

/** Restarting ffmpeg costs a process spawn plus a seek; decoding through a gap
 *  costs one decode per frame. Past roughly a second, the restart wins. */
const SKIP_FRAMES = 40;

/** A video file presented as a pure function of time.
 *
 *  Decoding is inherently sequential, but a Film must be able to ask for any
 *  frame in any order. The reconciliation: hold one ffmpeg process positioned
 *  at a cursor, walk it forward for the common case (a render sweeping forward
 *  through a scene), and restart it on a seek. Each render worker owns its own
 *  source and renders a contiguous range, so the fast path is the normal one. */
export class VideoSource {
  private proc?: Subprocess<'ignore', 'pipe', 'pipe'>;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  /** undrained chunks, plus how far into the first one we have already read */
  private chunks: Uint8Array[] = [];
  private chunkOff = 0;
  private buffered = 0;
  private eof = false;

  /** output-frame index held by `lastFrame`; -1 when nothing is decoded yet */
  private cursor = -1;
  private lastFrame?: Buffer;
  private box: Box = { w: 0, h: 0 };
  private framing: Framing = DEFAULT_FRAMING;
  private closed = false;
  /** frames decoded and thrown away, and process restarts — render diagnostics */
  readonly stats = { decoded: 0, restarts: 0 };

  private constructor(readonly meta: VideoMeta, readonly fps: number) {}

  static async open(file: string, fps: number): Promise<VideoSource> {
    const meta = await probeVideo(file);
    if (!(fps > 0)) throw new Error(`video source needs a positive fps, got ${fps}`);
    return new VideoSource(meta, fps);
  }

  /** Source dimensions as displayed, i.e. after container rotation. */
  get displaySize(): Box {
    const { width, height, rotation } = this.meta;
    return rotation === 90 || rotation === 270 ? { w: height, h: width } : { w: width, h: height };
  }

  /** How many output frames the clip yields from `from` onwards. */
  framesFrom(from: number): number {
    return Math.max(0, Math.floor((this.meta.duration - Math.max(0, from)) * this.fps));
  }

  /** Premultiplied-alpha RGBA for the source at `time`, sized exactly to `box`.
   *  That is the same pixel format resvg hands back, so the two composite with
   *  a plain multiply-add — see blendUnder. */
  async at(time: number, box: Box, framing: Framing = DEFAULT_FRAMING): Promise<Buffer> {
    if (this.closed) throw new Error('video source is closed');
    if (!(box.w > 0 && box.h > 0)) throw new Error(`camera box must be positive, got ${box.w}x${box.h}`);

    // The hold-on-tail behaviour at the end of this method only works if there
    // is a decoded frame to hold. Seeking past the clip lands ffmpeg on nothing,
    // so a large overshoot produced a black layer instead of a freeze — a short
    // one worked only because it stayed inside the no-restart window. Clamping
    // to the clip's last frame makes both paths behave the same.
    const lastIndex = Math.max(0, Math.round(this.meta.duration * this.fps) - 1);
    const want = Math.min(lastIndex, Math.max(0, Math.round(Math.max(0, time) * this.fps)));
    const reshaped = box.w !== this.box.w || box.h !== this.box.h || !sameFraming(framing, this.framing);
    if (reshaped) { this.box = { ...box }; this.framing = { ...framing }; }

    if (reshaped || !this.proc || want < this.cursor || want > this.cursor + SKIP_FRAMES) {
      await this.restart(want / this.fps);
    } else if (want === this.cursor && this.lastFrame) {
      return this.lastFrame;
    }

    await this.decodeTo(want);

    // A seek that lands after the clip's last keyframe decodes nothing, leaving
    // no tail frame to hold. One retry from slightly earlier finds a real one.
    if (!this.lastFrame && want > 0) {
      await this.restart(Math.max(0, want / this.fps - 0.5));
      await this.decodeTo(want);
    }

    // holding the last decoded frame past the end beats failing a render that is
    // otherwise fine; a clip shorter than its scene simply freezes on its tail
    return (this.lastFrame ??= Buffer.alloc(box.w * box.h * 4));
  }

  /** The filter chain that turns the source into exactly one box-sized frame.
   *
   *  Order matters far more than it looks. Cropping *before* scaling is the
   *  whole performance story: scaling first makes swscale resize the entire
   *  source up to cover the box — a 1280x720 webcam feeding a 1080x1920 canvas
   *  becomes 3413x1920, six megapixels a frame, most of it then thrown away.
   *  Cropping to the box's aspect at source resolution and scaling that once
   *  measures 7x faster on exactly that case: 120 frames in 0.73s against
   *  5.1s. */
  private filterChain(): string {
    const { w, h } = this.box;
    const { fit, zoom, offsetX, offsetY, mirror } = this.framing;
    const parts: string[] = [];

    // container rotation first, so every later filter works in display space
    if (this.meta.rotation === 90) parts.push('transpose=1');
    else if (this.meta.rotation === 270) parts.push('transpose=2');
    else if (this.meta.rotation === 180) parts.push('hflip', 'vflip');
    if (mirror) parts.push('hflip');

    // resample before any pixel work: a dropped frame should cost nothing
    parts.push(`fps=${this.fps}`);

    const { w: sw, h: sh } = this.displaySize;
    const z = Math.max(1, zoom);

    if (fit === 'contain' && z === 1) {
      parts.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      parts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`);
      // padding introduces transparent pixels, so the frame has to be
      // premultiplied to match what resvg produces
      parts.push('format=rgba', 'premultiply=inplace=1');
      return parts.join(',');
    }

    if (sw > 0 && sh > 0) {
      // the largest rectangle of the box's aspect that fits inside the source
      const aspect = w / h;
      let cw = sw, ch = Math.round(sw / aspect);
      if (ch > sh) { ch = sh; cw = Math.round(sh * aspect); }
      cw = Math.max(2, Math.min(sw, Math.round(cw / z)));
      ch = Math.max(2, Math.min(sh, Math.round(ch / z)));
      // offsets are a fraction of the visible box, so they pan by the same
      // proportion whatever the source resolution happens to be
      const x = clampInt(Math.round((sw - cw) / 2 + offsetX * cw), 0, sw - cw);
      const y = clampInt(Math.round((sh - ch) / 2 + offsetY * ch), 0, sh - ch);
      parts.push(`crop=${cw}:${ch}:${x}:${y}`, `scale=${w}:${h}`);
    } else {
      // no usable source dimensions: fall back to letting swscale work it out
      parts.push(`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`);
    }
    parts.push('format=rgba');   // opaque, so already premultiplied
    return parts.join(',');
  }

  /** Walk the decoder forward to `want`, stopping early at the end of the clip. */
  private async decodeTo(want: number): Promise<void> {
    while (this.cursor < want) {
      const next = await this.read();
      if (!next) break;                       // ran off the end of the clip
      this.lastFrame = next;
      this.cursor++;
      this.stats.decoded++;
    }
  }

  private async restart(time: number): Promise<void> {
    await this.stop();
    this.stats.restarts++;
    const args = [
      '-hide_banner', '-loglevel', 'error',
      // fast seek, before -i, so ffmpeg skips to the nearest keyframe instead
      // of decoding the whole clip up to this point
      '-ss', time.toFixed(4), '-i', this.meta.file,
      '-an', '-sn', '-dn',
      '-vf', this.filterChain(),
      '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
    ];
    this.proc = spawn(['ffmpeg', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    this.reader = this.proc.stdout.getReader();
    this.chunks = []; this.chunkOff = 0; this.buffered = 0; this.eof = false;
    this.cursor = Math.round(time * this.fps) - 1;   // the first read lands on `time`
    this.lastFrame = undefined;
  }

  /** Pull exactly one frame's worth of bytes off the stream.
   *  Chunks are consumed with an offset rather than resliced, so a frame costs
   *  one copy regardless of how ffmpeg happened to chunk its output. */
  private async read(): Promise<Buffer | undefined> {
    const need = this.box.w * this.box.h * 4;
    while (this.buffered < need) {
      if (this.eof || !this.reader) return undefined;
      const { done, value } = await this.reader.read();
      if (done) { this.eof = true; return undefined; }
      if (value?.byteLength) { this.chunks.push(value); this.buffered += value.byteLength; }
    }
    const out = Buffer.allocUnsafe(need);
    let written = 0;
    while (written < need) {
      const head = this.chunks[0]!;
      const avail = head.byteLength - this.chunkOff;
      const take = Math.min(avail, need - written);
      out.set(head.subarray(this.chunkOff, this.chunkOff + take), written);
      written += take;
      this.chunkOff += take;
      if (this.chunkOff >= head.byteLength) { this.chunks.shift(); this.chunkOff = 0; }
    }
    this.buffered -= need;
    return out;
  }

  private async stop(): Promise<void> {
    const p = this.proc, r = this.reader;
    this.proc = undefined; this.reader = undefined;
    if (r) { try { await r.cancel(); } catch {} }
    if (p) { try { p.kill(); await p.exited; } catch {} }
  }

  async close(): Promise<void> { this.closed = true; this.lastFrame = undefined; await this.stop(); }
}

const sameFraming = (a: Framing, b: Framing) =>
  a.fit === b.fit && a.zoom === b.zoom && a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.mirror === b.mirror;

const clampInt = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
