# Verification — September 23, 2026

Verified locally on macOS arm64 with Bun 1.4.2, ONNX Runtime 1.30.0 and the English `convaiinnovations/laya` snapshot `1c5edc17a7acd8701df6fc341c0d179f1c62c982`.

## Completed checks

- Frozen Bun dependency installation succeeded.
- TypeScript typecheck passed.
- 11 contract/unit tests passed (31 assertions), using the unmodified official `@typesafe-ai/sdk@0.6.0`.
- Full pretrained checkpoint exported to float32 ONNX with strict weight loading.
- PyTorch/ONNX logits and action logits matched on five fixtures (`rtol=0.002`, `atol=0.002`): standalone one-option choice, mixed choice/score/noul, JSON state with Unicode and a one-option question, a truncated 512-token state, and structured instructions/criteria.
- JavaScript input IDs, attention masks, marker positions/masks and question types matched the Python fixtures exactly. A masked second marker is added for standalone one-option export execution, and the output is compared to the original unpadded reference.
- Official SDK → actual HTTP socket → Bun → native ONNX passed all five fixtures. Decoded numeric outputs matched the Python reference logits within 0.002.
- The application entrypoint served `/health` with `status: ready`, `model: laya-english`, and `runtime: bun-onnx`.
- `bun examples/triage.ts` against the running application returned actual pretrained predictions.
- `git diff --check` passed.

## Observed example

State: `I was charged twice. Please refund the duplicate payment.`

| Answer | Observed value |
| --- | --- |
| department.choice | billing |
| department.probabilities.billing | 0.9294 |
| department.confidence | 0.7235 |
| urgency.score | 1.2589 |
| refund.noul | 0.9338 |
| usage.input_tokens | 128 |
| usage.output_tokens | 0 |

Confidence and selected-label probability intentionally differ: Laya uses entropy confidence for choice/score.

## Scope

This proves transport, tokenization and numerical inference parity for the tested English checkpoint; it is not a domain-accuracy or calibration benchmark. Unicode token parity does not prove Persian prediction quality. Multilingual and typed-decisions exports have not been executed or verified here. CI contains the lightweight tests; the local real-model smoke must be run separately after export. No external deployment or package publication was performed.

Reproduce with `bun run typecheck`, `bun test`, and `bun run smoke` after following the export steps in the README.
