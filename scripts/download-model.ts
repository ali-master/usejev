import {downloadFile} from '@huggingface/hub';
import {mkdir, rename, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

// Immutable revision: configs, tokenizer and weights must come from the same snapshot.
const revision = 'main';
const maxRetries = 5;
export const retryDelay = (retry: number) => Math.min(30_000, 1000 * 2 ** (retry - 1));
export type DownloadProgress = {
  phase: 'checking' | 'downloading' | 'retrying' | 'cached' | 'done' | 'failed';
  received: number;
  total: number;
  attempt: number;
  started: number;
  retryAt?: number;
  reason?: string;
};

const bytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GiB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${Math.round(n)} B`;
const duration = (seconds: number) => seconds < 60 ? `${Math.ceil(seconds)}s` : `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;

/** One bounded-width status line; no ANSI escapes when redirected to a file or CI. */
export function progressLine(label: string, state: DownloadProgress, now = performance.now()): string {
  const fraction = state.total ? Math.min(1, state.received / state.total) : 0;
  const rate = state.received / Math.max(0.001, (now - state.started) / 1000);
  const eta = rate ? duration((state.total - state.received) / rate) : '—';
  const filled = Math.floor(fraction * 12);
  const bar = '━'.repeat(filled) + '─'.repeat(12 - filled);
  const attempt = `try ${state.attempt}/${maxRetries + 1}`;
  if (state.phase === 'retrying') return `↻ ${label} · retry ${state.attempt}/${maxRetries} in ${duration(Math.max(0, ((state.retryAt ?? now) - now) / 1000))} · ${state.reason}`;
  if (state.phase === 'checking') return `◌ ${label} · checking · ${attempt}`;
  if (state.phase === 'failed') return `✕ ${label} · failed · ${attempt} · ${state.reason}`;
  if (state.phase === 'cached') return `✓ ${label} · cached · ${bytes(state.total)}`;
  if (state.phase === 'done') return `✓ ${label} · 100% · ${bytes(state.total)} · ${duration((now - state.started) / 1000)} · ${attempt}`;
  return `↓ ${label} ${bar} ${(fraction * 100).toFixed(1)}% · ${bytes(state.received)}/${bytes(state.total)} · ${bytes(rate)}/s · ETA ${eta} · ${attempt}`;
}

/** Retry transfers from byte zero; only a complete, size-checked file replaces the target. */
export async function downloadWithRetry(
  target: string,
  getBlob: () => Promise<Blob | null>,
  report: (state: DownloadProgress) => void,
  sleep: (ms: number) => Promise<unknown> = Bun.sleep,
) {
  await mkdir(dirname(target), {recursive: true});
  for (let attempt = 1; ; attempt++) {
    const state: DownloadProgress = {phase: 'checking', received: 0, total: 0, attempt, started: performance.now()};
    report({...state});
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let writer: ReturnType<ReturnType<typeof Bun.file>['writer']> | undefined;
    let localFailure = false;
    try {
      const blob = await getBlob();
      if (!blob) throw Object.assign(new Error('Model file not found'), {statusCode: 404});
      state.total = blob.size;
      if (await Bun.file(target).exists() && Bun.file(target).size === blob.size) {
        report({...state, phase: 'cached', received: blob.size});
        return;
      }
      // Remove an interrupted attempt before reopening: never append stale bytes.
      localFailure = true;
      await rm(`${target}.partial`, {force: true});
      writer = Bun.file(`${target}.partial`).writer();
      localFailure = false;
      reader = blob.stream().getReader();
      state.started = performance.now();
      state.phase = 'downloading';
      report({...state});
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        localFailure = true;
        writer.write(value);
        await writer.flush();
        localFailure = false;
        state.received += value.byteLength;
        report({...state});
      }
      localFailure = true;
      await writer.end();
      writer = undefined;
      localFailure = false;
      if (Bun.file(`${target}.partial`).size !== blob.size) throw new Error('Incomplete download');
      localFailure = true;
      await rename(`${target}.partial`, target);
      report({...state, phase: 'done'});
      return;
    } catch (cause) {
      if (reader) await reader.cancel().catch(() => {
      });
      if (writer) await Promise.resolve().then(() => writer!.end()).catch(() => {
      });
      await rm(`${target}.partial`, {force: true});
      const status = (cause as { statusCode?: number; status?: number } | null)?.statusCode ?? (cause as {
        status?: number
      } | null)?.status;
      const reason = localFailure ? 'local file error' : status ? `HTTP ${status}` : 'transfer interrupted';
      const retryable = !localFailure && (!status || status === 408 || status === 429 || status >= 500);
      if (!retryable || attempt > maxRetries) {
        report({...state, phase: 'failed', reason});
        throw cause;
      }
      const delay = retryDelay(attempt);
      report({...state, phase: 'retrying', retryAt: performance.now() + delay, reason});
      await sleep(delay);
    } finally {
      reader?.releaseLock();
    }
  }
}

async function main() {
  const checkpoint = process.env.LAYA_CHECKPOINT ?? 'english';
  if (!['english', 'multilingual', 'typed-decisions'].includes(checkpoint)) throw new Error('Invalid LAYA_CHECKPOINT');
  const prefix = checkpoint === 'english' ? '' : `${checkpoint}/`;
  const directory = resolve(process.env.LAYA_SOURCE_DIR ?? `models/${checkpoint}/source`);
  const provenance = Bun.file(`${directory}/provenance.json`);
  if (await provenance.exists()) {
    const previous = await provenance.json();
    if (previous.revision !== revision || previous.checkpoint !== checkpoint) throw new Error('Source directory contains another checkpoint/revision; use a new LAYA_SOURCE_DIR.');
  }
  const files = ['rl_agent_config.json', 'encoder/config.json', 'tokenizer/tokenizer.json', 'tokenizer/tokenizer_config.json', 'model.safetensors'];
  const tty = Boolean(process.stderr.isTTY);
  const color = tty && process.env.NO_COLOR === undefined;
  let state: DownloadProgress | undefined;
  let label = '';
  const draw = () => {
    if (!state) return;
    const width = Math.max(1, (process.stderr.columns || 120) - 1);
    let text = progressLine(label, state);
    if (tty && text.length > width) {
      const current = state;
      const compact = (name: string) => progressLine(name, current).replace(/ [━─]{12}/, '');
      const available = Math.max(1, width - compact('').length);
      const shortLabel = label.length > available ? `${label.slice(0, Math.max(0, available - 1))}…` : label;
      text = compact(shortLabel);
    }
    const line = tty && text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
    const tone = state.phase === 'failed' ? 31 : state.phase === 'retrying' ? 33 : state.phase === 'done' || state.phase === 'cached' ? 32 : 36;
    process.stderr.write(tty ? `\r\x1b[2K${color ? `\x1b[${tone}m` : ''}${line}${color ? '\x1b[0m' : ''}` : `${line}\n`);
  };
  const timer = tty ? setInterval(draw, 100) : undefined;
  try {
    for (const [index, file] of files.entries()) {
      label = `[${index + 1}/${files.length}] ${file}`;
      state = undefined;
      await downloadWithRetry(`${directory}/${file}`, () => downloadFile({
        repo: 'convaiinnovations/laya', revision, path: prefix + file, accessToken: process.env.HF_TOKEN,
      }), next => {
        const changed = state?.phase !== next.phase || state.attempt !== next.attempt;
        state = next;
        if (changed) draw();
      });
    }
    await Bun.write(`${directory}/provenance.json`, JSON.stringify({
      repo: 'convaiinnovations/laya',
      revision,
      checkpoint
    }, null, 2));
  } finally {
    if (timer) clearInterval(timer);
    if (tty) process.stderr.write('\n');
  }
  console.log(`✓ Model ready · ${directory}`);
}

if (import.meta.main) {
  await main().catch(cause => {
    console.error(cause instanceof Error ? cause.message : 'Download failed');
    process.exitCode = 1;
  });
}
