export interface Parsed { cmd: string; positional: string[]; flags: Record<string, string | boolean> }

export function parseArgs(argv: string[]): Parsed {
  const [cmd = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      if (inline !== undefined) flags[k!] = inline;
      else if (rest[i + 1] && !rest[i + 1]!.startsWith('-')) flags[k!] = rest[++i]!;
      else flags[k!] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      const k = a.slice(1);
      if (rest[i + 1] && !rest[i + 1]!.startsWith('-')) flags[k] = rest[++i]!;
      else flags[k] = true;
    } else positional.push(a);
  }
  return { cmd, positional, flags };
}

export const num = (v: string | boolean | undefined, d: number) => (typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
export const str = (v: string | boolean | undefined, d: string) => (typeof v === 'string' ? v : d);
