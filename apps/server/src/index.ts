import {resolve} from 'node:path';
import {LayaRuntime} from '@laya/runtime';
import {createApp} from './app';

const directory = resolve(process.env.LAYA_MODEL_DIR ?? 'models/english/onnx');
console.log(`Loading Laya from ${directory}`);
const runtime = await LayaRuntime.load(directory);
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const app = createApp(runtime, {apiKey: process.env.LAYA_API_KEY}).listen({
  hostname: process.env.HOST ?? '127.0.0.1',
  port,
  maxRequestBodySize: 1_048_576,
  idleTimeout: 120
});
console.log(`Laya ready at http://${app.server!.hostname}:${app.server!.port}`);
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  await app.stop();
  await runtime.dispose();
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
