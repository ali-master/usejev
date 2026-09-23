import { downloadFile } from '@huggingface/hub';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Immutable revision: configs, tokenizer and weights must come from the same snapshot.
const revision = '1c5edc17a7acd8701df6fc341c0d179f1c62c982';
const checkpoint = process.env.LAYA_CHECKPOINT ?? 'english';
if (!['english', 'multilingual', 'typed-decisions'].includes(checkpoint)) throw new Error('Invalid LAYA_CHECKPOINT');
const prefix = checkpoint === 'english' ? '' : `${checkpoint}/`;
const directory = resolve(process.env.LAYA_SOURCE_DIR ?? `models/${checkpoint}/source`);
const provenance = Bun.file(`${directory}/provenance.json`);
if (await provenance.exists()) {
  const previous = await provenance.json();
  if (previous.revision !== revision || previous.checkpoint !== checkpoint) throw new Error('Source directory contains another checkpoint/revision; use a new LAYA_SOURCE_DIR.');
}
for (const file of ['rl_agent_config.json', 'encoder/config.json', 'tokenizer/tokenizer.json', 'tokenizer/tokenizer_config.json', 'model.safetensors']) {
  const target = `${directory}/${file}`;
  console.log(`Checking ${prefix}${file}`);
  const blob = await downloadFile({ repo: 'convaiinnovations/laya', revision, path: prefix + file, accessToken: process.env.HF_TOKEN });
  if (!blob) throw new Error(`Missing model file: ${file}`);
  if (await Bun.file(target).exists() && Bun.file(target).size === blob.size) { console.log(`Cached: ${file}`); continue; }
  console.log(`Downloading ${prefix}${file} (${blob.size} bytes)`);
  await mkdir(dirname(target), { recursive: true });
  await Bun.write(`${target}.partial`, new Response(blob.stream()));
  if (Bun.file(`${target}.partial`).size !== blob.size) throw new Error(`Incomplete download: ${file}`);
  await rename(`${target}.partial`, target);
}
await Bun.write(`${directory}/provenance.json`, JSON.stringify({ repo: 'convaiinnovations/laya', revision, checkpoint }, null, 2));
console.log(directory);
