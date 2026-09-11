import { VideoSource } from './source';

/** One decoder per file per process. Scenes are rendered in timeline order
 *  within a worker, so a source that appears in several scenes stays on its
 *  fast path instead of being re-opened each time. */
export class SourcePool {
  private sources = new Map<string, Promise<VideoSource>>();

  constructor(readonly fps: number) {}

  get(file: string): Promise<VideoSource> {
    let s = this.sources.get(file);
    if (!s) { s = VideoSource.open(file, this.fps); this.sources.set(file, s); }
    return s;
  }

  async close(): Promise<void> {
    const all = [...this.sources.values()];
    this.sources.clear();
    await Promise.all(all.map(async (p) => { try { (await p).close(); } catch {} }));
  }
}
