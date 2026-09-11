import { spawn, type Subprocess } from 'bun';

export interface EncodeOpts {
  width: number; height: number; fps: number;
  out: string;
  /** lower = better quality, 18 is visually lossless-ish, 23 default */
  crf?: number;
  preset?: 'ultrafast'|'superfast'|'veryfast'|'faster'|'fast'|'medium'|'slow';
  /** audio track to mux in; must already be the right length */
  audio?: string;
  codec?: 'libx264' | 'libx265' | 'libvpx-vp9';
  /** keyframe interval in frames; 2s is right for social platforms */
  gop?: number;
  pixFmt?: string;
}

/** Streams raw RGBA frames into ffmpeg. One process for the whole render —
 *  no PNG round-trip, no intermediate files. */
export class Encoder {
  private proc: Subprocess<'pipe', 'pipe', 'pipe'>;
  private sink: ReturnType<Subprocess<'pipe'>['stdin']['write']> extends never ? never : any;
  private frames = 0;
  private closed = false;
  readonly frameBytes: number;

  constructor(private opts: EncodeOpts) {
    const { width, height, fps, out } = opts;
    this.frameBytes = width * height * 4;
    const gop = opts.gop ?? fps * 2;
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0',
      ...(opts.audio ? ['-i', opts.audio] : []),
      '-c:v', opts.codec ?? 'libx264',
      '-preset', opts.preset ?? 'medium',
      '-crf', String(opts.crf ?? 20),
      '-pix_fmt', opts.pixFmt ?? 'yuv420p',
      '-g', String(gop), '-keyint_min', String(gop),
      '-movflags', '+faststart',
      ...(opts.audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
      out,
    ];
    this.proc = spawn(['ffmpeg', ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    this.sink = this.proc.stdin;
  }

  /** Write one RGBA frame. Awaits flush so we respect ffmpeg's backpressure. */
  async write(pixels: Buffer | Uint8Array): Promise<void> {
    if (this.closed) throw new Error('encoder already finished');
    if (pixels.byteLength !== this.frameBytes) {
      throw new Error(`frame size mismatch: got ${pixels.byteLength}, expected ${this.frameBytes} (${this.opts.width}x${this.opts.height}x4)`);
    }
    this.sink.write(pixels);
    await this.sink.flush();
    this.frames++;
  }

  get frameCount() { return this.frames; }

  async finish(): Promise<{ frames: number; file: string }> {
    if (this.closed) return { frames: this.frames, file: this.opts.out };
    this.closed = true;
    await this.sink.end();
    const err = await new Response(this.proc.stderr).text();
    const code = await this.proc.exited;
    if (code !== 0) throw new Error(`ffmpeg exit ${code}:\n${err.split('\n').slice(-15).join('\n')}`);
    return { frames: this.frames, file: this.opts.out };
  }

  async abort() { this.closed = true; try { await this.sink.end(); } catch {} this.proc.kill(); }
}
