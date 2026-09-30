import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {downloadWithRetry, progressLine, retryDelay, type DownloadProgress} from '../scripts/download-model';

test('interrupted streams retry exponentially and replace files only after complete transfer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'laya-download-'));
  const target = join(dir, 'model');
  const delays: number[] = [];
  const states: DownloadProgress[] = [];
  let attempts = 0;
  try {
    await Bun.write(target, 'old');
    await downloadWithRetry(target, async () => {
      attempts++;
      expect(await Bun.file(target).text()).toBe('old');
      if (attempts <= 2) return {
        size: 8,
        stream: () => {
          let chunks = 0;
          return new ReadableStream<Uint8Array>({pull(controller) {
            if (chunks++ === 0) controller.enqueue(new TextEncoder().encode('broken'));
            else controller.error(new Error('Disconnected'));
          }});
        },
      } as Blob;
      return new Blob(['complete']);
    }, s => states.push(s), async ms => { delays.push(ms); });
    expect(delays).toEqual([1000, 2000]);
    expect(await Bun.file(target).text()).toBe('complete');
    expect(await Bun.file(`${target}.partial`).exists()).toBe(false);
    expect(states.filter(s => s.phase === 'retrying').map(s => s.attempt)).toEqual([1, 2]);
    expect(states.at(-1)).toMatchObject({phase: 'done', received: 8, attempt: 3});
    await downloadWithRetry(target, async () => new Blob(['complete']), s => states.push(s));
    expect(states.at(-1)?.phase).toBe('cached');
  } finally {await rm(dir, {recursive: true, force: true});}
});

test('permanent errors stop immediately; transient errors stop after five retries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'laya-download-'));
  try {
    for (const status of [401, 404, 503]) {
      let attempts = 0;
      const delays: number[] = [];
      const states: DownloadProgress[] = [];
      await expect(downloadWithRetry(join(dir, 'model'), async () => {
        attempts++;
        throw Object.assign(new Error('HTTP failure'), {statusCode: status});
      }, s => states.push(s), async ms => { delays.push(ms); })).rejects.toThrow('HTTP failure');
      expect(attempts).toBe(status === 503 ? 6 : 1);
      expect(delays).toEqual(status === 503 ? [1000, 2000, 4000, 8000, 16000] : []);
      expect(states.at(-1)?.phase).toBe('failed');
    }
  } finally {await rm(dir, {recursive: true, force: true});}
});

test('status shows progress, speed, ETA and retry countdown without embedded newlines', () => {
  const state: DownloadProgress = {phase: 'downloading', received: 1024, total: 2048, started: 1000, attempt: 2};
  const line = progressLine('model', state, 2000);
  expect(line).toContain('50.0%');
  expect(line).toContain('1.0 KiB/s');
  expect(line).toContain('ETA 1s');
  expect(line).toContain('try 2/6');
  expect(line).not.toMatch(/[\n\r\x1b]/);
  expect(progressLine('model', {...state, phase: 'retrying', retryAt: 6000, reason: 'HTTP 503'}, 2000)).toContain('retry 2/5 in 4s');
  expect(retryDelay(10)).toBe(30000);
});
