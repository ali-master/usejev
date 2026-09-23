import type {Question, SystemOneRequest} from '@typesafe-ai/sdk';
import type {Tokenizer} from '@huggingface/tokenizers';

export interface Manifest {
  format: 'laya-onnx-v1';
  repo: string;
  revision: string;
  checkpoint: string;
  max_len: number;
  head_max_len: number;
  temperature: number[];
  temperature_by_options: Record<string, number>;
  special_tokens: { cls: number; sep: number; mask: number; pad: number };
  mask_token: string;
}

export const questionTypes = {choice: 0, score: 1, noul: 2} as const;

/** Match upstream Python json.dumps spacing, including ASCII escaping for instructions. */
export function pythonJSON(value: unknown, ascii = false): string {
  let result: string;
  if (Array.isArray(value)) result = `[${value.map(v => pythonJSON(v, ascii)).join(', ')}]`;
  else if (value !== null && typeof value === 'object') result = `{${Object.entries(value).map(([k, v]) => `${pythonJSON(k, ascii)}: ${pythonJSON(v, ascii)}`).join(', ')}}`;
  else result = JSON.stringify(value);
  return ascii ? result.replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) : result;
}

const render = (value: unknown) => typeof value === 'string' ? value : pythonJSON(value);

/** Ordering is part of the model contract; noul markers are always [false, true]. */
export function renderOptions(q: Question): string[] {
  if (q.type === 'choice') return Object.entries(q.criteria).map(([k, v]) => v === null || v === '' ? k : `${k}: ${render(v)}`);
  if (q.type === 'score') return q.criteria.map((v, i) => `level ${i}: ${render(v)}`);
  return [
    `false: ${q.criteria?.false == null || q.criteria.false === '' ? 'no, the statement does not hold' : render(q.criteria.false)}`,
    `true: ${q.criteria?.true == null || q.criteria.true === '' ? 'yes, the statement holds' : render(q.criteria.true)}`,
  ];
}

/** Reproduce Laya's option-marker packing and separate head/state token budgets. */
export function buildSequence(tokenizer: Tokenizer, state: SystemOneRequest['state'], q: Question, cfg: Manifest) {
  const encode = (s: string) => tokenizer.encode(s.replaceAll(cfg.mask_token, ' '), {add_special_tokens: false}).ids;
  const instructions = typeof q.instructions === 'string' ? q.instructions : pythonJSON(q.instructions ?? null, true);
  let head = encode(`${q.type} question: ${instructions}`);
  let options = renderOptions(q).map(s => [cfg.special_tokens.mask, ...encode(` ${s}`).slice(0, 48)]);
  let budget = cfg.head_max_len - options.reduce((n, o) => n + o.length, 0);
  if (budget < 16) {
    const per = Math.max(4, Math.floor((cfg.head_max_len - 16) / options.length));
    options = options.map(o => o.slice(0, per));
    budget = cfg.head_max_len - options.reduce((n, o) => n + o.length, 0);
  }
  head = head.slice(0, Math.max(8, budget));
  const ids = [cfg.special_tokens.cls, ...head, cfg.special_tokens.sep];
  const markers: number[] = [];
  for (const option of options) {
    markers.push(ids.length);
    ids.push(...option);
  }
  ids.push(cfg.special_tokens.sep);
  const room = Math.max(0, cfg.max_len - ids.length - 1);
  ids.push(...encode(render(state)).slice(0, room), cfg.special_tokens.sep);
  if (markers.some(m => m >= cfg.max_len)) throw new Error('Options exceed the model token budget.');
  return {ids: ids.slice(0, cfg.max_len), markers, qtype: questionTypes[q.type]};
}

export function prepareBatch(tokenizer: Tokenizer, request: SystemOneRequest, cfg: Manifest) {
  const items = Object.values(request.questions).map(q => buildSequence(tokenizer, request.state, q, cfg));
  const length = Math.max(...items.map(i => i.ids.length));
  // ONNX exports the top-2 branch; a one-option question gets one masked padding slot.
  const options = Math.max(2, ...items.map(i => i.markers.length));
  return {
    items, length, options,
    input_ids: items.map(i => [...i.ids, ...Array(length - i.ids.length).fill(cfg.special_tokens.pad)] as number[]),
    attention_mask: items.map(i => [...Array(i.ids.length).fill(1), ...Array(length - i.ids.length).fill(0)] as number[]),
    marker_pos: items.map(i => [...i.markers, ...Array(options - i.markers.length).fill(0)] as number[]),
    marker_mask: items.map(i => [...Array(i.markers.length).fill(true), ...Array(options - i.markers.length).fill(false)] as boolean[]),
    qtype: items.map(i => i.qtype),
  };
}
