import {TypeSafeClient} from '@typesafe-ai/sdk';
import {decodeAnswer, LayaRuntime} from '../packages/runtime/src/index';
import {prepareBatch} from '../packages/runtime/src/sequence';
import {createApp} from '../apps/server/src/app';
import {deepStrictEqual, ok} from 'node:assert';

const directory = process.env.LAYA_MODEL_DIR ?? 'models/english/onnx';
const runtime = await LayaRuntime.load(directory);
const fixtures = await Bun.file(`${directory}/parity.json`).json();
const app = createApp(runtime).listen({hostname: '127.0.0.1', port: 0});
const client = new TypeSafeClient({
  apiKey: 'local-development',
  baseURL: `http://127.0.0.1:${app.server!.port}`,
  defaultModel: 'laya',
  timeout: 120_000,
  retry: {maxRetries: 0}
});
try {
  for (const fixture of fixtures) {
    const batch = prepareBatch(runtime.tokenizer, fixture.request, runtime.manifest);
    for (const key of ['input_ids', 'attention_mask', 'marker_pos', 'marker_mask', 'qtype'] as const) deepStrictEqual(batch[key], fixture.inputs[key], `Python/JS token parity: ${key}`);
    const started = performance.now();
    const result = await client.systemOne(fixture.request);
    Object.entries(fixture.request.questions).forEach(([name, question], i) => {
      const expected = decodeAnswer(question as never, fixture.logits[i], fixture.act_logits[i], runtime.manifest);
      const actual = result.answers[name] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(expected)) {
        if (typeof value === 'number') ok(Math.abs((actual[key] as number) - value) < 0.002, `${name}.${key} parity`);
        else if (value && typeof value === 'object' && key !== 'legend') {
          for (const [k, v] of Object.entries(value)) ok(Math.abs((actual[key] as Record<string, number>)[k] - Number(v)) < 0.002, `${name}.${key}.${k} parity`);
        } else deepStrictEqual(actual[key], value);
      }
    });
    console.log(JSON.stringify({
      questions: Object.keys(fixture.request.questions),
      ms: Math.round(performance.now() - started),
      result
    }, null, 2));
  }
  console.log('PASS: official SDK → real HTTP → Bun → native ONNX; tokenizer and PyTorch output parity.');
} finally {
  await app.stop();
  await runtime.dispose();
}
