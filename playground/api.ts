import {APIConnectionError, APIError, APITimeoutError, TypeSafeClient, TypeSafeError} from '@typesafe-ai/sdk';
import {validateRequest} from '../packages/runtime/src/validation';

export function createAPI(baseURL = process.env.LAYA_BASE_URL ?? 'http://127.0.0.1:3000') {
  const client = new TypeSafeClient({
    baseURL,
    apiKey: process.env.LAYA_API_KEY ?? 'local-development',
    defaultModel: 'laya',
    timeout: 90_000,
    retry: {maxRetries: 0}
  });
  const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'cache-control': 'no-store'}});
  return {
    async health() {
      try {
        const response = await fetch(`${baseURL.replace(/\/$/, '')}/health`, {signal: AbortSignal.timeout(3000)});
        if (!response.ok) return json({status: 'offline'}, 503);
        const body = await response.json();
        return json({status: body.status === 'ready' ? 'ready' : 'offline', model: body.model, runtime: body.runtime});
      } catch {
        return json({status: 'offline'}, 503);
      }
    },
    async run(request: Request) {
      // Browser requests stay same-origin; credentials never reach client code.
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return json({error: 'Cross-origin requests are not allowed.'}, 403);
      try {
        const body = await request.json();
        validateRequest(body);
        const started = performance.now();
        const {data, requestId} = await client.systemOne({
          state: body.state,
          questions: body.questions,
          model: 'laya'
        }, {signal: request.signal}).withResponse();
        return json({result: data, elapsedMs: Math.round(performance.now() - started), requestId});
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeSafeError && !(error instanceof APIError) && !(error instanceof APIConnectionError)) return json({error: error.message}, 400);
        if (error instanceof APITimeoutError) return json({error: 'The model took too long. Try a shorter input.'}, 504);
        if (error instanceof APIConnectionError) return json({error: 'The Laya server is unavailable. Start it with bun start in the project root.'}, 503);
        if (error instanceof APIError) return json({error: error.message}, error.status ?? 502);
        return json({error: 'The request could not be completed. Please try again.'}, 500);
      }
    },
  };
}
