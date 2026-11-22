# Milestone-10 Evidence — one real model, answering "2+2" with "4"

**Status: PASS in Node (2026-11-21, both runners). Browser end-to-end run
FAILED pre-fix the same day — fix pushed, retest pending. Local inference
stays PARTIAL until a real browser retest passes.**

## Browser failure — the bug that Node could not catch (2026-11-21 14:04 PT)

Desktop Chromium cloud browser, live preview
https://nvkglobal.github.io/nvk-agent/:

- Model `Xenova/Qwen1.5-0.5B-Chat` downloaded fine (1%→90%, "Local model
  loaded · adapter webgpu"). No crash, reload, or freeze on desktop.
- "What is 2+2? Answer in one word." sent twice, 60+ seconds each — the
  reply box stayed **completely empty** both times. Generation appeared to
  run (banner: "last generation 1.2 tok/s", then "1.3 tok/s"; pipeline
  reached the "result" stage) but produced no text.
- The app's own Diagnostics reported the validation FAIL: Qwen answered `""`
  to "2+2" (expected "4" or "four"). Local inference PARTIAL.

**Root cause (reproduced in Node the same day, `repro-empty.mjs`):**
`LocalInferenceEngine` never assigned its private `activeModelId` field in
`doLoad()` — only the *state* copy. So `generate()` resolved the model to
`null`, skipped the chat template, and sent Qwen the RAW prompt. Qwen1.5
chat-tuned emits its EOS token (`<|im_end|>`) immediately on a raw prompt:
zero new tokens, prompt echo only, stripped to `""`. The 1.2–1.3 tok/s was
the estimate's floor (1 token ÷ ~0.8 s) — consistent with an instant empty
return, not a slow generation. The Node test passed because it applies the
ChatML template itself and never goes through the engine — the two paths
had diverged without a test to catch it.

**Fix (same day):** `doLoad()` now assigns the field; `generate()` resolves
the model from the field with the state copy as fallback; the prompt
building is a pure exported function (`buildFullPrompt`) covered by tests.
A second bug rode along: the banner claimed "adapter webgpu" from
`navigator.gpu` presence, but transformers.js 2.17.2 runs WASM only in the
browser (its `executionProviders` are `['wasm']`; `'webgpu'` is commented
out). The adapter now reports WASM in the browser, CPU in Node. A third:
`env.useBrowserCache` was `false`, so every load re-downloaded the full
350 MB — the iPhone re-download loop. It is now `true`, with a cache
pre-check (`isModelCached`, Cache API store `transformers-cache`) that
reports "cached — loading from this device" before instantiation.

**Engine-path verification (same day, Node):** `npm run
test:milestone-10-engine` goes through `load()` + `generate()` with the
browser chat defaults (max 256 tokens, temperature 0.7): **PASS** —
"Two plus two equals four." in 4,808 ms, modelId correct
(`Xenova/Qwen1.5-0.5B-Chat`, not 'unknown').

## Passing run

- **Date:** 2026-11-21 ~13:22 PT
- **Runner:** `npm run test:milestone-10` (`tests/milestone-10.mjs`)
- **Model:** `Xenova/Qwen1.5-0.5B-Chat` (text-generation, ChatML template)
- **Prompt:** `"What is 2+2? Answer in one word."`
- **Model loaded in:** 6.0s (weights cached from the probe run)
- **Answer:** `"Two plus two equals four."`
- **Generation:** 2,976 ms, ~1.7 tok/s
- **Total run:** 9.0s
- **Check:** answer contains `4` or `four` as a standalone token — matched
  `"four"`. Exit code 0.

## Failing run (same day, same machine — the reason the default changed)

- **Model:** `Xenova/LaMini-Flan-T5-248M` (text2text-generation, CODEXA's
  smallest model, the original default)
- **Model loaded in:** 12.6s
- **Answer to the exact prompt:** `"2+2 is a common term"`
- **Generation:** 3,194 ms, ~1.6 tok/s — **FAIL**

Probe of five prompt shapes with Flan-T5-248M (all failed):

| Prompt | Answer |
|---|---|
| What is 2+2? Answer in one word. | 2+2 is a common term |
| Question: What is 2+2? Answer in one word. | The answer is "two". |
| Answer in one word: What is 2+2? | The answer is "six". |
| Q: What is 2+2? A: | 2+2 is a triplet |
| 2+2= | I'm sorry, I cannot provide |

Conclusion recorded in the code: Flan-T5-248M stays in the catalog for
instruction tasks, but it is **not** the default — it cannot do arithmetic
reliably. Qwen1.5-0.5B-Chat is the default because it passed.

## Small-model probe — the iPhone crash (2026-11-21)

Owner's iPhone: every time the model loads to 100% it crashes, resets, and
asks to download again. Desktop did not crash. Leading hypothesis (NOT
confirmed): iOS jetsam — 350 MB of weights + ONNX session + WASM in a
mobile Safari tab. The search for a smaller default that actually answers
2+2 found **none verifiable**:

| Candidate | Size | Result |
|---|---|---|
| Xenova/SmolLM-135M[-Instruct], SmolLM2-135M/360M-Instruct, Qwen2-0.5B-Instruct | — | HTTP 401 from the Hugging Face hub — not downloadable / unverifiable from this environment |
| Xenova/LaMini-Flan-T5-77M | 94 MB | FAIL — "2+2 is a word that has two equal sides." |
| Xenova/distilgpt2 | 84 MB | False pass — counts "1.2.1.2.3.4.5.6"; contains a 4 by accident. Fails the tightened token check. |
| Xenova/Qwen1.5-0.5B-Chat | 350 MB | **PASS — the only passing model; stays the default on every device** |

Mitigations shipped instead of a model swap: browser cache ON (a crash no
longer forces a full re-download — the retry loads from cache), a cache
pre-check before instantiation, WASM threads capped to 2 on low-memory
devices (iPhone/iPad, ≤ 4 GB RAM), and an honest low-memory warning in the
chat download panel before the 350 MB download starts. If the owner retests
and it still crashes at 100%, the next step is a genuinely smaller passing
model — none exists in the public Xenova set today — or a native/wrapper
build, not another silent retry loop.

## What "four" counts

The check accepts `4` or `four` as a standalone whitespace token (sentence
punctuation stripped). A correct answer in words is a correct answer. The
token rule exists because the old word-boundary check passed distilgpt2's
counting ramble "1.2.1.2.3.4.5.6" — a 4 inside a number sequence is not an
answer. The check lives in `src/intelligence/inference.ts`
(`checkMilestone10Answer`) and is mirrored in `tests/milestone-10.mjs` —
keep them in sync.

## Reproduce

```bash
npm run test:milestone-10        # Qwen (default, pipeline-direct)
npm run test:milestone-10-engine # Qwen, through the real engine path (browser chat defaults)
NVK_AGENT_MODEL=Xenova/LaMini-Flan-T5-248M npm run test:milestone-10  # Flan (fails)
```
