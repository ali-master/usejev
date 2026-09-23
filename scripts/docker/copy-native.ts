import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Keep the native package external to Bun's bundle; its binding uses relative paths.
const requireRuntime = createRequire(join(process.cwd(), 'packages/runtime/package.json'));
const nativeRoot = dirname(requireRuntime.resolve('onnxruntime-node/package.json'));
const requireNative = createRequire(join(nativeRoot, 'package.json'));
const commonRoot = dirname(dirname(dirname(requireNative.resolve('onnxruntime-common'))));
const output = '/out/native/node_modules';
for (const [name, source] of [['onnxruntime-node', nativeRoot], ['onnxruntime-common', commonRoot]]) {
  const target = join(output, name!);
  await mkdir(target, { recursive: true });
  for (const entry of ['package.json', 'dist']) {
    await cp(join(source!, entry), join(target, entry), { recursive: true });
  }
}
const binding = `bin/napi-v6/${process.platform}/${process.arch}`;
await cp(join(nativeRoot, binding), join(output, 'onnxruntime-node', binding), { recursive: true });
// Preserve dependency notices with the redistributed native runtime.
for (const source of [nativeRoot, commonRoot]) {
  for await (const file of new Bun.Glob('*{LICENSE,NOTICE}*').scan(source)) {
    await cp(join(source, file), join(output, source === nativeRoot ? 'onnxruntime-node' : 'onnxruntime-common', file));
  }
}
