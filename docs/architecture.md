# Architecture and sources

The serving path is:

`@typesafe-ai/sdk → HTTP /v1/systemone → Elysia → Hugging Face Tokenizer → ONNX Runtime native CPU → typed answers`

There is no subprocess, Python service, hosted inference provider, generated text parsing, or custom SDK in this path.

The upstream repository publishes a custom PyTorch `DecisionModel`, not a ready-to-run Transformers.js pipeline. Its safetensors contain both encoder and decision-head weights. The Hub also reports no hosted Inference Provider for this model. Consequently `@huggingface/inference` cannot by itself execute these weights in Bun. We use `@huggingface/hub` for download and `@huggingface/tokenizers` for preprocessing; `onnxruntime-node` executes the exported full network via Bun's Node native addon support.

Python is used once to export the actual architecture, with strict weight loading. `scripts/vendor/laya_common.py` preserves the upstream reference architecture, sequence builder and collation for comparison. `scripts/export_graph.py` expands the decision head's multihead attention into equivalent tensor operations because legacy ONNX export freezes its sequence reshape. Multiple sequence lengths, batches and option counts are compared against the unmodified PyTorch implementation. The runtime pads option count to at least two for the exported act-head top-2 operation; that slot is masked and excluded from decoding.

The HTTP layer applies validation, model selection, authentication and bounded serialization. The runtime owns only the resident checkpoint, tokenization, tensor construction and decoding. This separation lets HTTP tests inject a deterministic engine while the real-model smoke remains independent and explicit.

## Upstream references

- Model: https://huggingface.co/convaiinnovations/laya
- Model snapshot: `1c5edc17a7acd8701df6fc341c0d179f1c62c982`
- Original architecture: https://github.com/NandhaKishorM/laya/blob/8e58a6cd8ddb1717008976aa2fd7bf836b27e0d7/laya/common.py
- Original decoder: https://github.com/NandhaKishorM/laya/blob/main/laya/agent.py
- TypeSafe JavaScript SDK: https://github.com/typesafe-ai/typesafe-sdk-js
- Hugging Face JS SDK: https://huggingface.co/docs/huggingface.js/en/index
- PR #3: https://github.com/NandhaKishorM/laya/pull/3 — TypeSafe-compatible HTTP API, Python execution.
- PR #197: https://github.com/NandhaKishorM/laya/pull/197 — typed HTTP client and Python adapter; not native JavaScript inference.

Laya's vendored reference code and weights are Apache-2.0. The code was obtained on September 23, 2026. Its license is preserved at `licenses/Laya-Apache-2.0.txt`. The installed official TypeSafe SDK retains its own MIT license. Neither SDK source nor a fork of it is included in this project.
