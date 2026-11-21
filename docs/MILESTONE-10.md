# Milestone-10 Evidence — one real model, answering "2+2" with "4"

**Status: PASS (2026-11-21, Node on this VM).** The browser end-to-end run is
still pending — the in-browser path is the product's real path.

## Passing run

- **Date:** 2026-11-21 ~13:22 PT
- **Runner:** `npm run test:milestone-10` (`tests/milestone-10.mjs`)
- **Model:** `Xenova/Qwen1.5-0.5B-Chat` (text-generation, ChatML template)
- **Prompt:** `"What is 2+2? Answer in one word."`
- **Model loaded in:** 6.0s (weights cached from the probe run)
- **Answer:** `"Two plus two equals four."`
- **Generation:** 2,976 ms, ~1.7 tok/s
- **Total run:** 9.0s
- **Check:** answer contains `4` or `four` as a standalone word — matched
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

## What "four" counts

The check accepts `4` or `four` (case-insensitive, word boundary). A correct
answer in words is a correct answer. The check lives in
`src/intelligence/inference.ts` (`checkMilestone10Answer`) and is mirrored in
`tests/milestone-10.mjs` — keep them in sync.

## Reproduce

```bash
npm run test:milestone-10        # Qwen (default)
NVK_AGENT_MODEL=Xenova/LaMini-Flan-T5-248M npm run test:milestone-10  # Flan (fails)
```
