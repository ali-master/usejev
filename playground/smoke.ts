import { demoContent } from './src/demos-fa';
import { demos } from './src/demos';
import { validateResult } from '../packages/runtime/src/validation';
const base = process.env.PLAYGROUND_URL ?? 'http://127.0.0.1:3001';
const language = process.env.DEMO_LANGUAGE === 'fa' ? 'fa' : 'en';
let runs = 0;
for (const scenario of demos) {
  const demo = { ...scenario, ...demoContent(scenario, language) };
  for (const state of demo.samples) {
    const response = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions: demo.questions }) });
    const body = await response.json();
    if (!response.ok) throw new Error(`${demo.id}: ${JSON.stringify(body)}`);
    validateResult(body.result, demo.questions);
    if (!body.requestId || !Number.isFinite(body.elapsedMs)) throw new Error('Missing real request metadata');
    runs++;
  }
  console.log(`PASS ${demo.id} (${language}, both samples)`);
}
console.log(`${runs} real inferences passed across ${demos.length} demos.`);
