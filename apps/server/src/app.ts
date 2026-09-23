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
  return new Elysia()
    .onRequest(({request, set}) => {
      set.headers['x-typesafe-request-id'] = crypto.randomUUID();
      if (new URL(request.url).pathname === '/health') return;
      if (options.apiKey) {
        const expected = Buffer.from(`Bearer ${options.apiKey}`);
        const actual = Buffer.from(request.headers.get('authorization') ?? '');
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          set.status = 401;
          return error('Invalid API key.', 'authentication_error');
        }
      }
    })
    .onError(({code, error: cause, set}) => {
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
      const run = tail.then(async () => {
        request.signal.throwIfAborted();
        return engine.predict(body);
      });
      tail = run.catch(() => undefined);
      try {
        return await run;
      } finally {
        pending--;
      }
    });
}
