import index from './index.html';
import { createAPI } from './api';
const api = createAPI();
const server = Bun.serve({
  hostname: process.env.PLAYGROUND_HOST ?? '127.0.0.1',
  port: Number(process.env.PLAYGROUND_PORT ?? 3001),
  maxRequestBodySize: 1_048_576,
  idleTimeout: 120,
  development: process.env.NODE_ENV !== 'production' ? { hmr: true, console: true } : false,
  routes: { '/': index, '/api/health': { GET: () => api.health() }, '/api/run': { POST: request => api.run(request) } },
  fetch: () => new Response('Not found', { status: 404 }),
});
console.log(`Laya Playground → ${server.url}`);
