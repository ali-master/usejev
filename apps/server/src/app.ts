import {Elysia} from 'elysia';
import {timingSafeEqual} from 'node:crypto';
import {type SystemOneRequest, type SystemOneResult, TypeSafeError} from '@typesafe-ai/sdk';
import {validateRequest} from '@laya/runtime';

export interface Engine {
  manifest: { checkpoint: string; revision: string };
  
  predict(request: SystemOneRequest): Promise<SystemOneResult<SystemOneRequest['questions']>>;
}

export interface ServerOptions {
  apiKey?: string;
  maxPending?: number
}

/** Bound concurrency so HTTP traffic cannot allocate an unbounded number of model batches. */
export function createApp(engine: Engine, options: ServerOptions = {}) {
  let pending = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const model = `laya-${engine.manifest.checkpoint}`;
  const aliases = new Set(['laya', model]);
  const error = (message: string, code: string) => ({error: {message, type: code, code}});
  const metrics = new WeakMap<Request, {
    started: number; cpu: NodeJS.CpuUsage; rss: number; pending: number;
    queueMs?: number; inferenceMs?: number;
  }>();
  const finishMetrics = (request: Request, headers: Record<string, unknown>) => {
    const sample = metrics.get(request);
    if (!sample) return;
    const elapsed = performance.now() - sample.started;
    const cpu = process.cpuUsage(sample.cpu);
    const memory = process.memoryUsage();
    const cpuMs = (cpu.user + cpu.system) / 1000;
    const timing = [`app;dur=${elapsed.toFixed(2)}`];
    if (sample.queueMs !== undefined) timing.push(`queue;dur=${sample.queueMs.toFixed(2)}`);
    if (sample.inferenceMs !== undefined) timing.push(`inference;dur=${sample.inferenceMs.toFixed(2)}`);
    Object.assign(headers, {
      'server-timing': timing.join(', '),
      'x-response-time-ms': elapsed.toFixed(2),
      'x-laya-process-cpu-ms': cpuMs.toFixed(2),
      'x-laya-process-cpu-percent': (cpuMs / Math.max(elapsed, 0.001) * 100).toFixed(2),
      'x-laya-process-rss-bytes': String(memory.rss),
      'x-laya-process-rss-delta-bytes': String(memory.rss - sample.rss),
      'x-laya-process-heap-used-bytes': String(memory.heapUsed),
      'x-laya-pending-at-arrival': String(sample.pending),
      'x-laya-model': model,
    });
    metrics.delete(request);
  };
  return new Elysia()
    .onRequest(({request, set}) => {
      metrics.set(request, {
        started: performance.now(),
        cpu: process.cpuUsage(),
        rss: process.memoryUsage.rss(),
        pending
      });
      set.headers['x-typesafe-request-id'] = crypto.randomUUID();
      if (new URL(request.url).pathname === '/health') return;
      if (options.apiKey) {
        const expected = Buffer.from(`Bearer ${options.apiKey}`);
        const actual = Buffer.from(request.headers.get('authorization') ?? '');
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          finishMetrics(request, set.headers);
          set.status = 401;
          return error('Invalid API key.', 'authentication_error');
        }
      }
    })
    .mapResponse(({request, set}) => {
      finishMetrics(request, set.headers);
    })
    .onError(({request, code, error: cause, set}) => {
      finishMetrics(request, set.headers);
      if (cause instanceof TypeSafeError || code === 'PARSE' || code === 'VALIDATION') {
        set.status = 400;
        return error(cause instanceof Error ? cause.message : 'Invalid request.', 'invalid_request');
      }
      if (code === 'NOT_FOUND') {
        set.status = 404;
        return error('Route not found.', 'not_found');
      }
      console.error('Inference failed:', cause);
      set.status = 500;
      return error('Inference failed.', 'internal_error');
    })
    .get('/health', () => ({status: 'ready', model, revision: engine.manifest.revision, runtime: 'bun-onnx', pending}))
    .get('/v1/models', () => ({
      models: [{
        name: model,
        description: `Laya ${engine.manifest.checkpoint} checkpoint, native ONNX inference`,
        release_date: ''
      }]
    }))
    .post('/v1/systemone', async ({body, request, set}) => {
      validateRequest(body);
      if (body.model && !aliases.has(body.model)) {
        set.status = 404;
        return error(`Model ${body.model} is not loaded. Use ${model} or laya.`, 'model_not_found');
      }
      if (pending >= (options.maxPending ?? 8)) {
        set.status = 429;
        set.headers['retry-after'] = '1';
        return error('Inference queue is full.', 'rate_limit_error');
      }
      pending++;
      const queuedAt = performance.now();
      const run = tail.then(async () => {
        const started = performance.now();
        const sample = metrics.get(request)!;
        sample.queueMs = started - queuedAt;
        request.signal.throwIfAborted();
        try {
          const result = await engine.predict(body);
          set.headers['x-laya-input-tokens'] = String(result.usage.input_tokens);
          set.headers['x-laya-output-tokens'] = String(result.usage.output_tokens);
          return result;
        } finally {
          sample.inferenceMs = performance.now() - started;
        }
      });
      tail = run.catch(() => undefined);
      try {
        return await run;
      } finally {
        pending--;
      }
    });
}
