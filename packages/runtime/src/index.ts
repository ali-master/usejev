import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Tokenizer} from '@huggingface/tokenizers';
import {InferenceSession, Tensor} from 'onnxruntime-node';
import type {Question, SystemOneRequest, SystemOneResult} from '@typesafe-ai/sdk';
import {type Manifest, prepareBatch, questionTypes} from './sequence';
import {validateRequest, validateResult} from './validation';

export {validateRequest} from './validation';
export type {Manifest} from './sequence';

const round = (n: number) => Math.round(n * 1e4) / 1e4;

export function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exp = values.map(v => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
}

/** Preserve upstream temperature safeguards and entropy confidence (not top-label probability). */
export function decodeAnswer(q: Question, logits: number[], act: number[], cfg: Manifest) {
  const k = q.type === 'noul' ? 2 : Object.keys(q.criteria).length;
  const bucket = `${q.type}:${k <= 2 ? '2' : k <= 5 ? '3-5' : k <= 10 ? '6-10' : '11+'}`;
  const raw = cfg.temperature_by_options?.[bucket] ?? cfg.temperature[questionTypes[q.type]] ?? 1;
  const temperature = Number.isFinite(raw) ? Math.min(5, Math.max(0.5, raw)) : 1;
  const probabilities = softmax(logits.slice(0, k).map(v => v / temperature));
  const entropy = -probabilities.reduce((s, p) => s + p * Math.log(Math.max(1e-12, p)), 0);
  const confidence = k < 2 ? 1 : round(Math.min(1, Math.max(0, 1 - entropy / Math.log(k))));
  const action = {act_probability: round(softmax(act)[0])};
  if (q.type === 'noul') return {
    type: 'noul' as const,
    noul: round(probabilities[1]),
    confidence: round(Math.max(probabilities[1], 1 - probabilities[1])),
    action
  };
  const keys = Object.keys(q.criteria);
  const distribution = Object.fromEntries(keys.map((key, i) => [key, round(probabilities[i])]));
  if (q.type === 'choice') return {
    type: 'choice' as const,
    choice: keys[probabilities.indexOf(Math.max(...probabilities))],
    confidence,
    probabilities: distribution,
    action
  };
  return {
    type: 'score' as const,
    score: round(probabilities.reduce((s, p, i) => s + p * i, 0)),
    confidence,
    probabilities: distribution,
    legend: Object.fromEntries(q.criteria.map((v, i) => [String(i), v])),
    action
  };
}

/** One resident checkpoint; all forward passes execute natively in the Bun process. */
export class LayaRuntime {
  private constructor(readonly manifest: Manifest, readonly tokenizer: Tokenizer, private readonly session: InferenceSession) {
  }

  static async load(directory: string): Promise<LayaRuntime> {
    const json = async (name: string) => JSON.parse(await readFile(join(directory, name), 'utf8'));
    const manifest = await json('manifest.json') as Manifest;
    if (manifest.format !== 'laya-onnx-v1' || !Number.isInteger(manifest.max_len) || manifest.max_len < 16 || !Object.values(manifest.special_tokens).every(Number.isInteger)) throw new Error('Invalid Laya ONNX manifest. Run model:export first.');
    const tokenizer = new Tokenizer(await json('tokenizer.json'), await json('tokenizer_config.json'));
    const session = await InferenceSession.create(join(directory, 'model.onnx'), {
      executionProviders: ['cpu'],
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
      graphOptimizationLevel: 'all'
    });
    return new LayaRuntime(manifest, tokenizer, session);
  }

  async predict(request: SystemOneRequest): Promise<SystemOneResult<SystemOneRequest['questions']>> {
    validateRequest(request);
    const batch = prepareBatch(this.tokenizer, request, this.manifest);
    const count = batch.items.length;
    const int64 = (values: number[], dims: number[]) => new Tensor('int64', BigInt64Array.from(values, BigInt), dims);
    const output = await this.session.run({
      input_ids: int64(batch.input_ids.flat(), [count, batch.length]),
      attention_mask: int64(batch.attention_mask.flat(), [count, batch.length]),
      marker_pos: int64(batch.marker_pos.flat(), [count, batch.options]),
      marker_mask: new Tensor('bool', Uint8Array.from(batch.marker_mask.flat(), Number), [count, batch.options]),
      qtype: int64(batch.qtype, [count]),
    });
    const logits = Array.from(output.logits.data as Float32Array);
    const acts = Array.from(output.act_logits.data as Float32Array);
    const actSize = output.act_logits.dims[1];
    const result = {
      model: `laya-${this.manifest.checkpoint}`,
      answers: Object.fromEntries(Object.entries(request.questions).map(([name, q], i) => [name, decodeAnswer(q, logits.slice(i * batch.options, (i + 1) * batch.options), acts.slice(i * actSize, (i + 1) * actSize), this.manifest)])),
      usage: {input_tokens: batch.items.reduce((n, i) => n + i.ids.length, 0), output_tokens: 0},
    };
    try {
      validateResult(result, request.questions);
    } catch (cause) {
      throw new Error('Model returned an invalid result.', {cause});
    }
    return result;
  }

  async dispose() {
    await this.session.release();
  }
}
