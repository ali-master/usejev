import {expect, test} from 'bun:test';
import {demos} from '../playground/src/demos';
import {createAPI} from '../playground/api';
import {validateRequest} from '../packages/runtime/src/validation';

test('all 16 demos have distinct IDs and two valid examples', () => {
  expect(demos).toHaveLength(16);
  expect(new Set(demos.map(d => d.id)).size).toBe(16);
  for (const demo of demos) {
    expect(demo.samples[0]).not.toBe(demo.samples[1]);
    for (const state of demo.samples) expect(() => validateRequest({state, questions: demo.questions})).not.toThrow();
  }
});

test('playground rejects malformed inputs before attempting model inference', async () => {
  const api = createAPI('http://127.0.0.1:1');
  for (const body of ['{bad', '{}', JSON.stringify({state: 'test', questions: {}})]) {
    const response = await api.run(new Request('http://localhost/api/run', {method: 'POST', body}));
    expect(response.status).toBe(400);
  }
});

test('playground does not accept requests from unrelated websites', async () => {
  const response = await createAPI().run(new Request('http://localhost/api/run', {
    method: 'POST',
    headers: {origin: 'https://unrelated.example'},
    body: '{}'
  }));
  expect(response.status).toBe(403);
});

test('unavailable model reports offline instead of returning sample predictions', async () => {
  const api = createAPI('http://127.0.0.1:1');
  expect((await api.health()).status).toBe(503);
  const response = await api.run(new Request('http://localhost/api/run', {
    method: 'POST',
    body: JSON.stringify({state: demos[0].samples[0], questions: demos[0].questions})
  }));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('unavailable');
});
