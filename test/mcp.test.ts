import { test, expect, describe } from 'bun:test';
import { spawn } from 'bun';

/** Drive the server the way a client does: JSON-RPC over stdio. Testing it any
 *  other way would not catch the mistake that actually breaks an MCP server —
 *  something printing to stdout and corrupting the protocol stream. */
async function rpc(calls: object[]): Promise<Map<number, any>> {
  const p = spawn(['bun', 'run', 'packages/mcp/bin/stingo-mcp.ts'], {
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
  const lines = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...calls,
  ];
  p.stdin.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  await p.stdin.flush();

  const want = 1 + calls.filter((c: any) => c.id != null).length;
  const out = new Map<number, any>();
  const reader = p.stdout.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + 120_000;
  while (out.size < want && Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) continue;
      const m = JSON.parse(line);
      if (m.id != null) out.set(m.id, m);
    }
  }
  p.kill();
  await p.exited;
  return out;
}

const call = (id: number, name: string, args: object = {}) =>
  ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

const SCRIPT = `title: Test
canvas: { preset: horizontal, fps: 30 }
taste: bootdev
scenes:
  - block: stat
    value: "7x"
    label: faster
    dur: 3s
`;

describe('mcp server', () => {
  test('initializes and advertises its tools', async () => {
    const r = await rpc([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    expect(r.get(1)?.result?.serverInfo?.name).toBe('stingo');
    const names = r.get(2)!.result.tools.map((t: any) => t.name);
    for (const n of ['stingo_validate', 'stingo_plan', 'stingo_still', 'stingo_render', 'stingo_docs']) {
      expect(names).toContain(n);
    }
  }, 130_000);

  test('validates an inline script and plans it', async () => {
    const r = await rpc([
      call(2, 'stingo_validate', { source: SCRIPT }),
      call(3, 'stingo_plan', { source: SCRIPT }),
    ]);
    expect(r.get(2)!.result.isError).toBeFalsy();
    expect(r.get(2)!.result.content[0].text).toContain('valid');
    expect(r.get(3)!.result.content[0].text).toContain('stat');
  }, 130_000);

  test('reports schema errors instead of throwing', async () => {
    const r = await rpc([call(2, 'stingo_validate', { source: 'scenes:\n  - block: nonsense\n' })]);
    expect(r.get(2)!.result.isError).toBe(true);
  }, 130_000);

  test('a still comes back as an image, not a path', async () => {
    const r = await rpc([call(2, 'stingo_still', { source: SCRIPT, at: 1 })]);
    const content = r.get(2)!.result.content;
    const img = content.find((c: any) => c.type === 'image');
    expect(img).toBeDefined();
    expect(img.mimeType).toBe('image/png');
    // a real frame, not a stub
    expect(img.data.length).toBeGreaterThan(10_000);
    expect(Buffer.from(img.data, 'base64').subarray(1, 4).toString()).toBe('PNG');
  }, 130_000);

  test('render refuses a film past the duration guard', async () => {
    const r = await rpc([call(2, 'stingo_render', {
      source: SCRIPT, out: '/tmp/stingo-mcp-should-not-exist.mp4', maxSeconds: 0.5,
    })]);
    expect(r.get(2)!.result.isError).toBe(true);
    expect(r.get(2)!.result.content[0].text).toContain('guard');
  }, 130_000);

  test('serves its own documentation', async () => {
    const r = await rpc([call(2, 'stingo_docs', { page: 'camera' })]);
    expect(r.get(2)!.result.content[0].text).toContain('layout');
  }, 130_000);
});
