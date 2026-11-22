/**
 * NVK Agent — Milestone-10 test through the REAL engine path (Node runner).
 *
 * The pipeline-direct test (tests/milestone-10.mjs) applies the chat
 * template itself, so it could NOT catch the 2026-11-21 browser bug:
 * LocalInferenceEngine never assigned its private activeModelId field, so
 * generate() skipped the chat template, Qwen got a raw prompt, emitted
 * EOS immediately, and the browser showed empty replies while Node passed.
 * This script goes through LocalInferenceEngine.load() + generate() with
 * the browser chat defaults (maxNewTokens 256, temperature 0.7) and asserts
 * the answer passes AND the reported modelId is the real model (not
 * 'unknown'). Exit code 0 = PASS, 1 = FAIL.
 *
 * Run: npm run test:milestone-10-engine
 */
import { localInferenceEngine, checkMilestone10Answer } from '../src/intelligence/inference';

const PROMPT = 'What is 2+2? Answer in one word.';

console.log('NVK Agent — milestone-10 (engine path)');
const loadStarted = Date.now();
const loaded = await localInferenceEngine.load('Xenova/Qwen1.5-0.5B-Chat');
console.log(`Model loaded: ${loaded} in ${((Date.now() - loadStarted) / 1000).toFixed(1)}s`);
if (!loaded) {
  console.error('FAIL — model failed to load');
  process.exit(1);
}
const state = localInferenceEngine.getState();
console.log(`Engine state: activeModelId=${state.activeModelId} adapter=${state.lastAdapter}`);

const genStarted = Date.now();
const result = await localInferenceEngine.generate(PROMPT, { maxNewTokens: 256, temperature: 0.7 });
const elapsedMs = Date.now() - genStarted;
console.log(`Answer: ${JSON.stringify(result.text)} (${elapsedMs} ms, ${result.tokensPerSecond} tok/s, modelId=${result.modelId})`);

const check = checkMilestone10Answer(result.text);
if (!check.pass) {
  console.log(`MILESTONE-10 (engine): FAIL — expected "4" or "four", got ${JSON.stringify(result.text)}.`);
  process.exit(1);
}
if (result.modelId !== 'Xenova/Qwen1.5-0.5B-Chat') {
  console.log(`MILESTONE-10 (engine): FAIL — modelId is "${result.modelId}", not the loaded model.`);
  process.exit(1);
}
console.log(`MILESTONE-10 (engine): PASS — answered "2+2" with "${check.matched}", modelId correct.`);
process.exit(0);
