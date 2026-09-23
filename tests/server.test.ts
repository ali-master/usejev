import {describe, expect, test} from 'bun:test';
import {choice, noul, score, type SystemOneRequest, TypeSafeClient, TypeSafeError} from '@typesafe-ai/sdk';
import {createApp, type Engine} from '../apps/server/src/app';
import {validateRequest, validateResult} from '../packages/runtime/src/validation';
import {decodeAnswer} from '../packages/runtime/src/index';
import type {Manifest} from '../packages/runtime/src/sequence';

const manifest = {
  checkpoint: 'english',
  revision: 'test',
  temperature: [1, 1, 1],
  temperature_by_options: {}
} as unknown as Manifest;
const engine: Engine = {
  manifest,
  async predict(request) {
    return {
      model: 'laya-english',
      usage: {input_tokens: 42, output_tokens: 0},
      answers: Object.fromEntries(Object.entries(request.questions).map(([name, q]) => [name, decodeAnswer(q, [1, 2, 3], [2, 1], manifest)]))
    };
  },
};

function clientFor(app: ReturnType<typeof createApp>, key = 'test') {
  return new TypeSafeClient({
    apiKey: key,
    baseURL: 'http://localhost',
    defaultModel: 'laya',
    retry: {maxRetries: 0},
    fetch: (url, init) => app.handle(new Request(url, init))
  });
}

const payload = {state: 'refund', questions: {refund: noul('Refund?')}};

describe('Official TypeSafe SDK compatibility', () => {
  test('all primitives, inferred labels, metadata and model listing', async () => {
    const client = clientFor(createApp(engine));
    const {data, requestId, response} = await client.systemOne({
      state: 'refund', questions: {
        department: choice('Department?', {billing: null, technical: null, other: null}),
        urgency: score('Urgency?', ['low', 'medium', 'high']), refund: noul('Refund?'),
      }
    }).withResponse();
    const label: 'billing' | 'technical' | 'other' = data.answers.department.choice;
    expect(label).toBe('other');
    expect(data.answers.urgency.legend['2']).toBe('high');
    expect(data.answers.refund.noul).toBeGreaterThan(0.5);
    expect(data.usage.output_tokens).toBe(0);
    expect(requestId).toBeTruthy();
    expect(response.status).toBe(200);
    expect((await client.models.list())[0].name).toBe('laya-english');
  });
  test('authentication is enforced when configured', async () => {
    const app = createApp(engine, {apiKey: 'secret'});
    await expect(clientFor(app).systemOne(payload).then(value => value)).rejects.toMatchObject({status: 401});
    expect((await clientFor(app, 'secret').systemOne(payload)).model).toBe('laya-english');
    expect((await app.handle(new Request('http://localhost/health'))).status).toBe(200);
  });
  test('rejects unknown models instead of silently selecting another checkpoint', async () => {
    await expect(clientFor(createApp(engine)).systemOne({
      ...payload,
      model: 'jev-latest'
    }).then(value => value)).rejects.toMatchObject({status: 404});
  });
  test('malformed JSON is a 400 error, not an inference request', async () => {
    const response = await createApp(engine).handle(new Request('http://localhost/v1/systemone', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: '{broken',
    }));
    expect(response.status).toBe(400);
  });
  test('recovers queue capacity after a rejected prediction', async () => {
    let calls = 0;
    const app = createApp({
      ...engine, predict: async r => {
        if (++calls === 1) throw new TypeSafeError('Invalid model input');
        return engine.predict(r);
      }
    }, {maxPending: 1});
    const client = clientFor(app);
    await expect(client.systemOne(payload).then(value => value)).rejects.toMatchObject({status: 400});
    expect((await client.systemOne(payload)).model).toBe('laya-english');
  });
  test('invalid HTTP requests return structured 400 errors', async () => {
    for (const body of [{}, {state: 'x', questions: {}}, {
      state: 'x',
      questions: {x: {type: 'score', criteria: ['one']}}
    }]) {
      const res = await createApp(engine).handle(new Request('http://localhost/v1/systemone', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body)
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_request');
    }
  });
  test('bounds the queue and releases capacity after completion', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    const app = createApp({
      ...engine, predict: async r => {
        entered();
        await gate;
        return engine.predict(r);
      }
    }, {maxPending: 1});
    const client = clientFor(app);
    const first = client.systemOne(payload);
    await started;
    await expect(client.systemOne(payload).then(value => value)).rejects.toMatchObject({status: 429});
    release();
    await first;
    expect((await client.systemOne(payload)).model).toBe('laya-english');
  });
});

describe('model contract', () => {
  test('rejects non-JSON values and malformed criteria before inference', () => {
    for (const state of [NaN, undefined, new Date(), {x: Infinity}]) expect(() => validateRequest({
      ...payload,
      state
    })).toThrow();
    expect(() => validateRequest({state: null, questions: {x: {type: 'choice', criteria: {}}}})).toThrow();
  });
  test('uses false/true ordering and expected ordinal score', () => {
    const answer = decodeAnswer(noul(), [0, Math.log(3)], [0, 0], manifest);
    expect(answer).toMatchObject({noul: 0.75});
    expect(decodeAnswer(score(null, ['low', 'high']), [0, 0], [0, 0], manifest)).toMatchObject({
      score: 0.5,
      confidence: 0
    });
  });
  test('clamps dangerous temperature sharpening like upstream', () => {
    const q = choice(null, {a: null, b: null});
    const result = decodeAnswer(q, [0, 1], [0, 0], {...manifest, temperature_by_options: {'choice:2': 0.1}});
    expect(result).toMatchObject({probabilities: {a: 0.1192, b: 0.8808}});
  });
  test('rejects invalid model output rather than presenting a typed lie', async () => {
    const request = {state: '', questions: {x: choice(null, {a: null, b: null})}} satisfies SystemOneRequest;
    const result = await engine.predict(request);
    (result.answers.x as { choice: string }).choice = 'unknown';
    expect(() => validateResult(result, request.questions)).toThrow();
  });
});
