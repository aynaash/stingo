/** One representative scene per block, and the moment worth showing.
 *
 *  Shared by the gallery and the docs generator so a block's picture and its
 *  YAML example are the same scene. `at` is a fraction of the scene, so it
 *  survives a change to how long the block runs. */
export interface Shot { scene: Record<string, any>; at?: number }

export const GO = `func main() {
    ch := make(chan string)

    go func() {
        ch <- "done"
    }()

    fmt.Println(<-ch)
}`;

export const BLOCK_SHOTS: Record<string, Shot> = {
  title: { scene: { block: 'title', kicker: 'concurrency', text: 'Goroutines are not threads', sub: 'And that difference is the whole point.' }, at: 0.85 },
  statement: { scene: { block: 'statement', text: 'Waiting is not working.', emphasis: ['working.'] }, at: 0.9 },
  code: { scene: { block: 'code', lang: 'go', code: GO, highlight: [4, 5], caption: 'go starts it; the channel says when it finished.' }, at: 0.95 },
  terminal: { scene: { block: 'terminal', title: 'bench', lines: [
    { prompt: '$', cmd: 'go run serial.go', out: 'processed 200 jobs in 20.4s' },
    { prompt: '$', cmd: 'go run parallel.go', out: 'processed 200 jobs in 1.1s' }] }, at: 0.97 },
  stat: { scene: { block: 'stat', value: '18x', label: 'faster', sub: 'Same CPU. It simply stopped waiting in line.' }, at: 0.9 },
  list: { scene: { block: 'list', title: 'Why Sleep fails', marker: 'arrow', items: [
    'You are guessing how long work takes', 'Too short, and you drop results',
    'Too long, and you waste the speedup', 'It will break on a slower machine'] }, at: 0.95 },
  chart: { scene: { block: 'chart', kind: 'bar', title: '200 jobs, same machine', unit: 's',
    data: [{ label: 'serial', value: 20.4 }, { label: 'parallel', value: 1.1 }], highlightIndex: 1 }, at: 0.92 },
  diagram: { scene: { block: 'diagram', title: 'fan out, fan in', nodes: [
    { id: 'main', label: 'main', at: [0, 0], span: 2, accent: true },
    { id: 'w1', label: 'worker', at: [0, 1] }, { id: 'w2', label: 'worker', at: [1, 1] },
    { id: 'ch', label: 'results chan', at: [0, 2], span: 2, kind: 'queue' }],
    edges: [{ from: 'main', to: 'w1', label: 'go' }, { from: 'main', to: 'w2', label: 'go' },
            { from: 'w1', to: 'ch' }, { from: 'w2', to: 'ch' }] }, at: 0.95 },
  quote: { scene: { block: 'quote', text: 'Do not communicate by sharing memory; share memory by communicating.', attrib: 'Rob Pike' }, at: 0.92 },
  compare: { scene: { block: 'compare',
    left: { title: 'OS thread', items: ['1 MB stack, reserved up front', 'Kernel schedules it', 'Thousands is a lot'] },
    right: { title: 'goroutine', items: ['2 KB stack, grows on demand', 'Go runtime schedules it', 'Millions is fine'] } }, at: 0.95 },
  outro: { scene: { block: 'outro', text: 'Now go write something concurrent', sub: 'Then run it with -race.', handle: '@stingo' }, at: 0.9 },
  broll: { scene: { block: 'broll', caption: 'a breathing beat between sections', bg: { kind: 'particles', opacity: 0.8 } }, at: 0.7 },
  image: { scene: { block: 'image', src: './diagram.png', frame: 'window', title: 'diagram.png', caption: 'A still, framed like a window.' }, at: 0.8 },
  camera: { scene: { block: 'camera', camera: { src: 'takes/01.mp4', layout: 'pip' },
    lower: { name: 'Your name', role: 'the person explaining' } }, at: 0.5 },
};
