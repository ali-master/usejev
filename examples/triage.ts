import {choice, noul, score, TypeSafeClient} from '@typesafe-ai/sdk';

const client = new TypeSafeClient({
  baseURL: process.env.LAYA_BASE_URL ?? 'http://127.0.0.1:3000',
  // The official SDK requires a key even when local server authentication is disabled.
  apiKey: process.env.LAYA_API_KEY ?? 'local-development',
  defaultModel: 'laya',
  timeout: 60_000,
});
const result = await client.systemOne({
  state: 'I was charged twice. Please refund the duplicate payment.',
  questions: {
    department: choice('Which department should handle this request?', {
      billing: 'invoices, payments, refunds', technical: 'bugs, outages', other: null,
    }),
    urgency: score('How urgent is the request?', ['not urgent', 'soon', 'critical']),
    refund: noul('Does the user request a refund?'),
  },
});
console.log(JSON.stringify(result, null, 2));
