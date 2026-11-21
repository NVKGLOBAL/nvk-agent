/**
 * NVK Agent — Milestone-10 test (Node runner).
 *
 * The CODEXA milestone-10 test, as a runnable script: load a real model and
 * ask "2+2? Answer in one word." PASS requires the answer "4" or "four".
 *
 * Default model: Xenova/Qwen1.5-0.5B-Chat (350 MB) with its ChatML template.
 * Evidence for the choice (probed 2026-11-21): LaMini-Flan-T5-248M failed
 * 2+2 in five prompt shapes (answered "two", "six", "triplet", "common
 * term"); Qwen answered "Two plus two equals four." with the chat template.
 * "Four" counts: a correct answer in words is a correct answer.
 *
 * Run:  npm run test:milestone-10
 *
 * Downloads ~350 MB of model weights from the Hugging Face hub on first run
 * (cached in ~/.cache/huggingface afterwards). Prints the device, model,
 * load time, answer, and measured tokens/s — the evidence package for the
 * milestone. Exit code 0 = PASS, 1 = FAIL.
 */
import { pipeline } from '@xenova/transformers';

const MODEL_ID = process.env.NVK_AGENT_MODEL ?? 'Xenova/Qwen1.5-0.5B-Chat';
const PROMPT = 'What is 2+2? Answer in one word.';
const CHAT_TEMPLATE =
  '<|im_start|>user\n{{prompt}}<|im_end|>\n<|im_start|>assistant\n';

// Mirrors checkMilestone10Answer in src/intelligence/inference.ts — keep in sync.
function checkAnswer(answer) {
  const m = answer.match(/\b(4|four)\b/i);
  return { pass: m !== null, matched: m ? m[1] : null };
}

const started = Date.now();
console.log(`NVK Agent — milestone-10 test`);
console.log(`Model: ${MODEL_ID}`);
console.log(`Prompt: ${JSON.stringify(PROMPT)}`);

let generator;
try {
  const loadStarted = Date.now();
  generator = await pipeline('text-generation', MODEL_ID, {
    progress_callback: (info) => {
      if (info?.status === 'progress' && typeof info.progress === 'number') {
        process.stdout.write(`\rDownloading ${info.file ?? 'weights'}: ${Math.round(info.progress)}%`);
      }
    },
  });
  console.log(`\nModel loaded in ${((Date.now() - loadStarted) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error(`\nFAIL — model failed to load: ${err?.message ?? err}`);
  process.exit(1);
}

const fullPrompt = CHAT_TEMPLATE.replace('{{prompt}}', PROMPT);
const genStarted = Date.now();
let output;
try {
  output = await generator(fullPrompt, {
    max_new_tokens: 16,
    temperature: 0,
    do_sample: false,
  });
} catch (err) {
  console.error(`FAIL — generation failed: ${err?.message ?? err}`);
  process.exit(1);
}
const elapsedMs = Date.now() - genStarted;

let text = '';
if (Array.isArray(output) && output.length > 0) {
  text = output[0].generated_text ?? output[0].text ?? '';
} else if (typeof output === 'string') {
  text = output;
}
// Strip the chat-template echo: take the text after the last "assistant" turn.
const marker = 'assistant\n';
const markerIdx = text.lastIndexOf(marker);
if (markerIdx >= 0) text = text.slice(markerIdx + marker.length).trim();
else if (text.startsWith(fullPrompt)) text = text.slice(fullPrompt.length).trim();

const check = checkAnswer(text);
const tokenEstimate = Math.max(1, text.split(/\s+/).filter(Boolean).length);
const tokPerSec = (tokenEstimate / (elapsedMs / 1000)).toFixed(1);

console.log(`Answer: ${JSON.stringify(text.trim())}`);
console.log(`Generation: ${elapsedMs} ms, ~${tokPerSec} tok/s`);
console.log(`Total: ${((Date.now() - started) / 1000).toFixed(1)}s`);

if (check.pass) {
  console.log(`MILESTONE-10: PASS — model answered "2+2" with "${check.matched}".`);
  process.exit(0);
} else {
  console.log(`MILESTONE-10: FAIL — expected "4" or "four", got ${JSON.stringify(text.trim())}.`);
  process.exit(1);
}
