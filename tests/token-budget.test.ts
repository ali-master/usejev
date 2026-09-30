import {expect, test} from 'bun:test';
import {noul} from '@typesafe-ai/sdk';
import {LayaRuntime} from '../packages/runtime/src/index';
import {buildSequence, type Manifest} from '../packages/runtime/src/sequence';
import {createApp} from '../apps/server/src/app';

// One character per token makes boundary assertions independent of downloaded weights.
const tokenizer = {encode: (text: string) => ({ids: Array.from(text, c => c.charCodeAt(0))})} as unknown as Parameters<typeof buildSequence>[0];
const manifest = {max_len: 512, head_max_len: 192, mask_token: '[MASK]', special_tokens: {cls: 1, sep: 2, mask: 3, pad: 0}, checkpoint: 'test'} as Manifest;
const q = noul('Is this true?');

test('reports exact-fit and overflow without changing upstream sequence packing', () => {
  const budget = buildSequence(tokenizer, '', q, manifest).stateTokenBudget;
  const exact = buildSequence(tokenizer, 'x'.repeat(budget), q, manifest);
  expect(exact.stateTokens).toBe(exact.stateTokenBudget);
  expect(exact.ids).toHaveLength(512);
  const overflow = buildSequence(tokenizer, 'x'.repeat(budget) + 'changed tail', q, manifest);
  expect(overflow.ids).toEqual(exact.ids);
  expect(overflow.stateTokens).toBeGreaterThan(overflow.stateTokenBudget);
});

test('rejects overflow in any question before native inference and returns actionable HTTP 400', async () => {
  let calls = 0;
  const session = {run: async () => { calls++; throw new Error('Native inference must not run'); }};
  const runtime = Reflect.construct(LayaRuntime, [manifest, tokenizer, session]) as LayaRuntime;
  const longQuestion = noul('x'.repeat(300));
  const budget = buildSequence(tokenizer, '', longQuestion, manifest).stateTokenBudget;
  const request = {state: 'x'.repeat(budget + 1), questions: {short: q, long: longQuestion}};
  expect(buildSequence(tokenizer, request.state, q, manifest).stateTokenBudget).toBeGreaterThan(budget + 1);
  const response = await createApp(runtime).handle(new Request('http://localhost/v1/systemone', {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(request),
  }));
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error.code).toBe('invalid_request');
  expect(body.error.message).toContain('question "long"');
  expect(body.error.message).toContain(`${budget + 1} tokens supplied, ${budget} available`);
  expect(calls).toBe(0);
});
