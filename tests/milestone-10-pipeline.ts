/**
 * NVK Agent — Milestone-10 test through the REAL chat path (Node runner).
 *
 * Regression test for the 2026-11-21 chat-path bug: the v0.1.1 fix made
 * the VALIDATION path answer 2+2 correctly (greedy, temperature 0), but
 * the CHAT path (runPipeline → generate) still used the engine's sampling
 * default (temperature 0.7) — and sampling on this 0.5B model made 2+2 a
 * coin flip. The browser drew "1"; the Node repro drew "Two + Two is
 * two!" and "Two." in 2 of 3 runs. The engine-level test passed once by
 * luck and could not catch it, because it never went through runPipeline.
 *
 * This script goes through runPipeline() twice and asserts each answer
 * passes the milestone check, the route is local, the modelId is the real
 * model, and the stored conversation turn carries the same answer the
 * pipeline returned (memory/UI layer). Exit code 0 = PASS, 1 = FAIL.
 *
 * Run: npm run test:milestone-10-pipeline
 */
import { localInferenceEngine, checkMilestone10Answer } from '../src/intelligence/inference';
import { runPipeline } from '../src/intelligence/pipeline';
import { memoryStore } from '../src/intelligence/memory';

const PROMPT = 'What is 2+2? Answer in one word.';
const EXPECTED_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';

console.log('NVK Agent — milestone-10 (chat path, runPipeline)');
const loadStarted = Date.now();
const loaded = await localInferenceEngine.load(EXPECTED_MODEL);
console.log(`Model loaded: ${loaded} in ${((Date.now() - loadStarted) / 1000).toFixed(1)}s`);
if (!loaded) {
  console.error('FAIL — model failed to load');
  process.exit(1);
}

for (let i = 0; i < 2; i++) {
  const result = await runPipeline(PROMPT);
  console.log(
    `Run ${i + 1}: answer=${JSON.stringify(result.answer)} route=${result.route} modelId=${result.modelId}`,
  );
  const check = checkMilestone10Answer(result.answer);
  if (!check.pass) {
    console.log(
      `MILESTONE-10 (pipeline): FAIL — expected "4" or "four", got ${JSON.stringify(result.answer)}.`,
    );
    process.exit(1);
  }
  if (result.route !== 'local') {
    console.log(`MILESTONE-10 (pipeline): FAIL — route is "${result.route}", not "local".`);
    process.exit(1);
  }
  if (result.modelId !== EXPECTED_MODEL) {
    console.log(
      `MILESTONE-10 (pipeline): FAIL — modelId is "${result.modelId}", not the loaded model.`,
    );
    process.exit(1);
  }
  // The stored agent turn must carry the same answer the pipeline returned.
  const turns = await memoryStore.getConversation();
  const lastAgent = [...turns].reverse().find((t) => t.role === 'agent');
  if (!lastAgent || lastAgent.text !== result.answer) {
    console.log(
      `MILESTONE-10 (pipeline): FAIL — stored agent turn ${JSON.stringify(lastAgent?.text)} does not match pipeline answer ${JSON.stringify(result.answer)}.`,
    );
    process.exit(1);
  }
}

console.log('MILESTONE-10 (pipeline): PASS — chat path answers "2+2" correctly, twice, and stores it.');
process.exit(0);
