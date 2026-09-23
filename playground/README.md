# Laya Playground

A local, responsive playground for the real Laya model. It uses the **official TypeSafe SDK on the server**, with a same-origin browser API. No SDK fork, sample predictions, external fonts, analytics, or Python process is used by the UI.

## Run

Start the already-exported model from the repository root:

```sh
bun start
```

In another terminal:

```sh
bun run playground
```

Open http://127.0.0.1:3001. To choose another port:

```sh
PLAYGROUND_PORT=3002 bun run playground
```

The model must be ready at `http://127.0.0.1:3000`. If it is not, the UI shows an offline status and an actionable error. It never substitutes canned predictions.

| Variable | Default |
| --- | --- |
| `PLAYGROUND_HOST` | `127.0.0.1` |
| `PLAYGROUND_PORT` | `3001` |
| `LAYA_BASE_URL` | `http://127.0.0.1:3000` |
| `LAYA_API_KEY` | `local-development` |

`LAYA_API_KEY` must match the model server when authentication is enabled. Keep it server-side. The playground is intended for local use; it does not add a separate public-user login system. The local-data description assumes the default local model endpoint.

## Explore

16 demos, each with two editable examples:

- **Customer:** inbox triage, review insights, churn signals, intent detection.
- **Content:** moderation, news categorization, emotion radar, publishing checklist.
- **Business:** lead qualification, invoice review, feedback routing, meeting follow-through.
- **Engineering:** incident triage, prompt guard, bug report quality, agent handoff.

Features include search and category filtering, text/JSON input, editable question schemas, probability bars, expected score distributions, yes/no probability rings, raw JSON, copyable SDK code, cancellation, and the last 30 successful runs in the current tab. History can be reopened with the exact original input/questions. Modified inputs explicitly mark previous results as stale.

The interface is **English and Persian**, with a language switch and right-to-left Persian layout, with light/dark themes. Fonts are bundled locally. Only the theme and language preference are saved in localStorage; input text, results and run history are not persisted by the playground.

All 16 demos include English and Persian input pairs, question instructions, answer names, choice labels and score criteria. Switching languages opens the corresponding demo content; edits are kept separately for each language until you select/reset a demo or reload. Prior results are marked stale when switching. The SDK code and requests use the current editor content.

The loaded checkpoint is still English. Persian requests are sent directly, without translation; Persian accuracy has not been verified. These scenarios are examples of the API, not a domain accuracy benchmark. Moderation, security and operational results do not trigger external actions. Probability and entropy confidence are labeled separately.

**Keyboard:** `⌘/Ctrl + Enter` to run, `/` to focus demo search, `Escape` to close the code dialog or mobile sidebar.

## Checks and production bundle

```sh
bun run typecheck
bun test
bun playground/smoke.ts
DEMO_LANGUAGE=fa bun playground/smoke.ts
bun run playground:build
NODE_ENV=production bun playground/dist/server.js
```

The smoke command requires both local servers and runs all **32 examples** against the actual pretrained model. Override `PLAYGROUND_URL` if using a different playground port. Lightweight tests also cover malformed requests, cross-origin rejection and unavailable-model behavior.

Verified on September 23, 2026: 15 total tests passed; all 32 demo examples returned valid real-model responses; the production bundle built successfully. Browser checks covered desktop, 390px mobile, dark mode, live inference, search, run history, code copying and invalid-JSON handling. This does not certify the accuracy of each classification.

## Files

- `server.ts` — Bun HTML serving and API routes.
- `api.ts` — official SDK connection, validation and error handling.
- `src/demos.ts` — all scenarios, English model inputs and questions.
- `src/demos-fa.ts` — Persian input samples and output requirements.
- `src/i18n.ts` — Persian UI and demo descriptions.
- `src/app.ts` — interactive UI and ephemeral session state.
- `src/styles.css` — responsive themes and RTL styling.
- `src/icons.ts` — local SVG icons.
- `smoke.ts` — real-model verification across every demo.
