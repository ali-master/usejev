import type {Questions, SystemOneRequest} from '@typesafe-ai/sdk';
import {TypeSafeError as LayaError} from '@typesafe-ai/sdk';

/** Reject values that JSON would silently alter (NaN, undefined, cycles, class instances). */
function jsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  const valid = Object.values(value).every((entry) => jsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const entry = (value: unknown) => (value === null || typeof value === 'string' || typeof value === 'object') && jsonValue(value);

function fail(message: string): never {
  throw new LayaError(message);
}

/** Validate the shared HTTP boundary before allocating model tensors. */
export function validateRequest(value: unknown): asserts value is SystemOneRequest {
  if (!record(value) || !('state' in value) || !entry(value.state)) fail('state must be text, JSON object, array, or null.');
  if (value.model !== undefined && (typeof value.model !== 'string' || !value.model.trim())) fail('model must be a nonempty string.');
  if (!record(value.questions) || !Object.keys(value.questions).length || Object.keys(value.questions).length > 32) fail('Provide between 1 and 32 questions.');
  for (const [name, q] of Object.entries(value.questions as Record<string, unknown>)) {
    if (!name || !record(q)) fail('Each question needs a name and definition.');
    if (q.instructions !== undefined && !entry(q.instructions)) fail(`${name}: invalid instructions.`);
    if (q.type === 'choice') {
      if (!record(q.criteria) || Object.keys(q.criteria).length < 1 || Object.keys(q.criteria).length > 32) fail(`${name}: provide 1–32 choice criteria.`);
      if (!Object.entries(q.criteria as Record<string, unknown>).every(([k, v]) => k.length > 0 && entry(v))) fail(`${name}: invalid choice criteria.`);
    } else if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 32 || !q.criteria.every(entry)) fail(`${name}: provide 2–32 score criteria.`);
    } else if (q.type === 'noul') {
      if (q.criteria != null && (!record(q.criteria) || !Object.entries(q.criteria).every(([k, v]) => ['false', 'true'].includes(k) && entry(v)))) fail(`${name}: invalid noul criteria.`);
    } else fail(`${name}: unsupported question type.`);
  }
}

/** Verify response labels and distributions before returning statically typed answers. */
export function validateResult(value: unknown, questions: Questions): void {
  if (!record(value) || typeof value.model !== 'string' || !record(value.answers) || !record(value.usage)) fail('Invalid model response.');
  const usage = value.usage as Record<string, unknown>;
  for (const key of ['input_tokens', 'output_tokens']) if (!Number.isInteger(usage[key]) || (usage[key] as number) < 0) fail('Invalid usage.');
  const answers = value.answers as Record<string, unknown>;
  if (Object.keys(answers).length !== Object.keys(questions).length) fail('Unexpected answer count.');
  const probability = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  for (const [name, q] of Object.entries(questions)) {
    const a = answers[name];
    if (!record(a) || a.type !== q.type) fail(`Invalid answer for ${name}.`);
    if (q.type === 'noul') {
      if (!probability(a.noul)) fail('Invalid noul probability.');
      continue;
    }
    const keys = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    if (!probability(a.confidence) || !record(a.probabilities)) fail('Invalid confidence or probabilities.');
    const p = a.probabilities as Record<string, unknown>;
    if (Object.keys(p).length !== keys.length || !keys.every(k => Object.hasOwn(p, k) && probability(p[k])) || Math.abs(keys.reduce((s, k) => s + (p[k] as number), 0) - 1) > 0.01) fail('Invalid probability distribution.');
    if (q.type === 'choice' && (typeof a.choice !== 'string' || !keys.includes(a.choice))) fail('Unknown choice label.');
    if (q.type === 'score' && (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > keys.length - 1 || !record(a.legend) || keys.some(k => JSON.stringify((a.legend as Record<string, unknown>)[k]) !== JSON.stringify(q.criteria[Number(k)])))) fail('Invalid score or legend.');
  }
}
