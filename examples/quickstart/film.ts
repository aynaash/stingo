import { film, title, statement, code, terminal, stat, list, chart, outro } from '@hersidev/stingo';

/** The code-first path. Run it with:
 *
 *     stingo render examples/quickstart/film.ts
 *     stingo render examples/quickstart/film.ts --horizontal --taste dusk
 */

const BENCH = [
  { label: 'serial', value: 20.4 },
  { label: 'parallel', value: 1.1 },
];

const MISTAKES = [
  'A goroutine nobody receives from leaks forever',
  'Unsynchronised writes are a race, not a visible bug',
  'Everyone waiting and nobody sending is a deadlock',
];

export default film('Goroutines in ninety seconds')
  .vertical()
  .fps(30)
  .taste('bootdev')
  .music('assets/music/loop128.mp3', { bpm: 'auto' })
  .add(
    title('Goroutines')
      .kicker('ninety seconds')
      .sub('Concurrency that costs almost nothing.')
      .bg('beams', { opacity: 0.6 }),

    statement('A thread reserves a megabyte. A goroutine takes two kilobytes.')
      .emphasis('megabyte.', 'kilobytes.'),

    code('go', [
      'func main() {',
      '    ch := make(chan string)',
      '',
      '    go func() {',
      '        ch <- "done"',
      '    }()',
      '',
      '    fmt.Println(<-ch)',
      '}',
    ].join('\n'))
      .highlight(4, 5)
      .caption('go starts it; the channel says when it finished.'),

    terminal()
      .title('bench')
      .run('go run serial.go', 'processed 200 jobs in 20.4s')
      .run('go run parallel.go', 'processed 200 jobs in 1.1s'),

    chart(BENCH).bar().title('200 jobs, same machine').unit('s').highlight(1),

    stat('18x', 'faster').sub('Same CPU. It simply stopped waiting in line.'),

    // scenes are just values, so ordinary code composes them
    list(...MISTAKES).title('Three ways to get hurt').marker('arrow'),

    outro('Now go write something concurrent')
      .sub('Then run it with -race.')
      .handle('@stingo')
      .bg('particles', { opacity: 0.7 }),
  );
