import type {SystemOneRequest, SystemOneResult} from '@typesafe-ai/sdk';

const secretKey = /^(authorization|cookie|set-cookie|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key)$/i;

/** Keep payloads readable without allowing terminal control sequences or unbounded output. */
export function formatPayload(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (key, item: unknown) => {
      if (secretKey.test(key)) return '[REDACTED]';
      if (typeof item === 'bigint') return String(item);
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    }, 2) ?? String(value);
    const safe = json.replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const lines = safe.slice(0, 6000).split('\n');
    const truncated = safe.length > 6000 || lines.length > 80;
    return lines.slice(0, 80).join('\n') + (truncated ? '\n… [truncated]' : '');
  } catch {
    return '[Unserializable payload]';
  }
}

/** Log at the shared inference boundary; diagnostics must never change prediction behavior. */
export async function logPrediction<T extends SystemOneResult<SystemOneRequest['questions']>>(
  request: SystemOneRequest,
  predict: () => Promise<T>,
): Promise<T> {
  if (process.env.LAYA_LOG === 'off') return predict();
  const id = crypto.randomUUID().slice(0, 8);
  const started = performance.now();
  const color = Boolean(process.stderr.isTTY) && process.env.NO_COLOR === undefined;
  const paint = (code: number, text: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const write = (event: string, code: number, details: unknown, summary = '') => {
    try {
      const time = new Date().toISOString();
      const header = `${time}  LAYA  ${event}  #${id}${summary ? `  ${summary}` : ''}`;
      const body = formatPayload(details).split('\n').map(line => `│  ${line}`).join('\n');
      // One write per block keeps concurrent requests from interleaving individual lines.
      process.stderr.write(`${paint(code, `╭─ ${header}`)}\n${body}\n${paint(code, '╰────────────────────────────────────────────────────────────')}\n`);
    } catch {
      // A broken diagnostic sink must not fail inference or mask its original error.
    }
  };
  write('REQUEST →', 36, request);
  try {
    const result = await predict();
    write('RESPONSE ✓', 32, result, `${(performance.now() - started).toFixed(1)} ms`);
    return result;
  } catch (cause) {
    write('ERROR ✕', 31, {message: cause instanceof Error ? cause.message : String(cause)}, `${(performance.now() - started).toFixed(1)} ms`);
    throw cause;
  }
}
