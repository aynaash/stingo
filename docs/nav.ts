export interface Page {
  slug: string;
  title: string;
  /** what the page answers, shown under the title and in <meta name=description> */
  blurb: string;
  section: string;
}

/** Ordered: this is both the sidebar and the reading order for prev/next. */
export const PAGES: Page[] = [
  {
    slug: 'mcp',
    title: 'Connect your AI',
    blurb: 'Give an agent the tools to write a script, render a frame, and look at what it made.',
    section: 'Start here',
  },
  {
    slug: 'start',
    title: 'Getting started',
    blurb: 'Install it, render the example, and change one line to see what happens.',
    section: 'Start here',
  },
  {
    slug: 'script',
    title: 'The script',
    blurb: 'Every field of a video document, and how a scene gets its length.',
    section: 'Reference',
  },
  {
    slug: 'blocks',
    title: 'Blocks',
    blurb: 'The twelve scene types, what each one takes, and what it looks like.',
    section: 'Reference',
  },
  {
    slug: 'taste',
    title: 'Taste profiles',
    blurb: 'Palette, type, motion, pacing and texture — and what stingo decides for you.',
    section: 'Reference',
  },
  {
    slug: 'camera',
    title: 'Talking head',
    blurb: 'Putting yourself in the frame: three layouts, take audio, and writing before you shoot.',
    section: 'Reference',
  },
  {
    slug: 'cli',
    title: 'Commands',
    blurb: 'Every command and flag, and what each one is for.',
    section: 'Reference',
  },
  {
    slug: 'internals',
    title: 'How it works',
    blurb: 'Pure frames, satori and resvg, the beat grid, and where the milliseconds went.',
    section: 'Under the hood',
  },
  {
    slug: 'roadmap',
    title: 'Roadmap',
    blurb: 'Where this is going: the complete technical content library for engineers.',
    section: 'Under the hood',
  },
];

export const SECTIONS = [...new Set(PAGES.map((p) => p.section))];
