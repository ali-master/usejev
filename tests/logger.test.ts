import {afterEach, expect, spyOn, test} from 'bun:test';
import {noul} from '@typesafe-ai/sdk';
import {formatPayload, logPrediction} from '../packages/runtime/src/logger';
import {LayaRuntime} from '../packages/runtime/src/index';

const request = {state: 'آیا بازپرداخت انجام شد؟', questions: {refund: noul('Refund?')}};
const result = {model: 'laya-english', answers: {}, usage: {input_tokens: 12, output_tokens: 0}};
const originalLog = process.env.LAYA_LOG;
const originalColor = process.env.NO_COLOR;
let sink: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  sink?.mockRestore();
  if (originalLog === undefined) delete process.env.LAYA_LOG;
  else process.env.LAYA_LOG = originalLog;
  if (originalColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = originalColor;
});

function capture() {
  process.env.LAYA_LOG = 'on';
  process.env.NO_COLOR = '1';
  const blocks: string[] = [];
  sink = spyOn(process.stderr, 'write').mockImplementation(chunk => {
    blocks.push(String(chunk));
    return true;
  });
  return blocks;
}

test('pairs concurrent requests with responses and preserves returned objects', async () => {
  const blocks = capture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = logPrediction(request, async () => { await gate; return result; });
  expect(await logPrediction(request, async () => result)).toBe(result);
  release();
  expect(await first).toBe(result);
  const ids = blocks.map(block => block.match(/#([a-f0-9]{8})/)![1]);
  expect(ids[0]).toBe(ids[3]);
  expect(ids[1]).toBe(ids[2]);
  expect(ids[0]).not.toBe(ids[1]);
  expect(blocks[0]).toContain(request.state);
  expect(blocks[2]).toContain('RESPONSE ✓');
  expect(blocks[2]).toContain('input_tokens');
  expect(blocks[2]).toMatch(/\d+\.\d ms/);
  expect(blocks.join('')).not.toContain('\x1b');
});

test('logs failures and rethrows the original error; silent mode still executes', async () => {
  const blocks = capture();
  const cause = new Error('Invalid model input');
  await expect(logPrediction(request, async () => { throw cause; })).rejects.toBe(cause);
  expect(blocks[1]).toContain('ERROR ✕');
  expect(blocks[1]).toContain(cause.message);
  process.env.LAYA_LOG = 'off';
  expect(await logPrediction(request, async () => result)).toBe(result);
  expect(blocks).toHaveLength(2);
});

test('redacts nested credentials, escapes terminal controls and bounds payloads', () => {
  const formatted = formatPayload({nested: {apiKey: 'hidden', password: 'hidden'}, text: '\x1b[2J\u009b31m\u202etest'});
  expect(formatted).not.toContain('hidden');
  expect(formatted).toContain('[REDACTED]');
  expect(formatted).not.toMatch(/[\x1b\u009b\u202e]/);
  expect(formatPayload('x'.repeat(7000))).toContain('[truncated]');
  expect(formatPayload(Array(100).fill('x')).split('\n')).toHaveLength(81);
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(formatPayload(cycle)).toContain('[Circular]');
});

test('logging failures cannot change inference success', async () => {
  capture();
  sink!.mockImplementation(() => { throw new Error('Broken sink'); });
  expect(await logPrediction(request, async () => result)).toBe(result);
});

test('the runtime logs validation failures before touching the native session', async () => {
  const blocks = capture();
  const runtime = Reflect.construct(LayaRuntime, [{checkpoint: 'english'}, null, null]) as LayaRuntime;
  await expect(runtime.predict({...request, questions: {}})).rejects.toThrow('Provide between 1 and 32 questions.');
  expect(blocks).toHaveLength(2);
  expect(blocks[0]).toContain('REQUEST →');
  expect(blocks[1]).toContain('ERROR ✕');
});
