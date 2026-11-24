/**
 * NVK Agent — registry + engine honesty tests.
 *
 * Run: npm test
 *
 * These tests assert the anti-theater rules in code:
 *  1. No OPERATIONAL capability lacks evidence.
 *  2. No SIMULATED capability is presented as working.
 *  3. The inference engine refuses to answer without a model — it never
 *     falls back to a canned response (the CODEXA 2+2 failure, fixed).
 *  4. The permission gate denies restricted actions without approval.
 *  5. The milestone-10 test file exists and names the real model + prompt.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CAPABILITIES,
  registrySelfCheck,
} from '../src/intelligence/capability-registry';
import {
  LocalInferenceEngine,
  ModelNotLoadedError,
  checkMilestone10Answer,
  buildFullPrompt,
  isLowMemoryDevice,
  INFERENCE_MODELS,
  AGENT_SYSTEM_PROMPT,
} from '../src/intelligence/inference';
import { PermissionGate } from '../src/intelligence/permissions';
import {
  classifyIntent,
  isIdentityQuestion,
  IDENTITY_ANSWER,
  runPipeline,
} from '../src/intelligence/pipeline';
import {
  loadAgentContextFromTexts,
  getAgentContext,
  isAgentContextLoaded,
  agentContextNote,
  contextContainsIdentityFacts,
  IDENTITY_FACTS,
} from '../src/intelligence/agent-context';
import { settingsStore } from '../src/intelligence/settings';

const here = dirname(fileURLToPath(import.meta.url));

test('milestone-10 check: real answers pass, counting rambles fail', () => {
  // Real answers.
  assert.equal(checkMilestone10Answer('Two plus two equals four.').pass, true);
  assert.equal(checkMilestone10Answer('4').pass, true);
  assert.equal(checkMilestone10Answer('The answer is 4.').pass, true);
  assert.equal(checkMilestone10Answer('(four)').pass, true);
  // Not answers: distilgpt2's 2026-11-21 "answer" counts "1.2.1.2.3.4.5.6"
  // and contains a 4 by accident — the old word-boundary check passed it.
  assert.equal(checkMilestone10Answer('1.2.1.2.3.4.5.6').pass, false);
  assert.equal(checkMilestone10Answer('The answer is 14.').pass, false);
  assert.equal(checkMilestone10Answer('2+2 is a word that has two equal sides.').pass, false);
  assert.equal(checkMilestone10Answer('').pass, false);
});

test('prompt builder: chat model gets its template, plain model gets raw prompt', () => {
  const qwen = INFERENCE_MODELS.find((m) => m.id === 'Xenova/Qwen1.5-0.5B-Chat');
  const flan = INFERENCE_MODELS.find((m) => m.id === 'Xenova/LaMini-Flan-T5-248M');
  assert.ok(qwen && flan);
  const templated = buildFullPrompt(qwen, 'What is 2+2?');
  assert.match(templated, /<\|im_start\|>assistant/);
  assert.match(templated, /What is 2\+2\?/);
  assert.equal(buildFullPrompt(flan, 'What is 2+2?'), 'What is 2+2?');
  assert.equal(buildFullPrompt(null, 'What is 2+2?'), 'What is 2+2?');
});

test('prompt builder: chat model gets the NVK identity system prompt (two-layer provenance)', () => {
  // Benchmark gap 1 (2026-11-23): identity 0/3 because no system message
  // existed anywhere in the intelligence path. The chat template must
  // carry a system turn naming both layers, before the user turn.
  const qwen = INFERENCE_MODELS.find((m) => m.id === 'Xenova/Qwen1.5-0.5B-Chat');
  assert.ok(qwen);
  const templated = buildFullPrompt(qwen, 'Who built you?');
  assert.match(templated, /<\|im_start\|>system/);
  assert.match(templated, /Nevik Elmo/);
  assert.match(templated, /NVK Global/);
  assert.match(templated, /Qwen1\.5-0\.5B-Chat/);
  assert.ok(
    templated.indexOf('<|im_start|>system') < templated.indexOf('<|im_start|>user'),
    'system turn must precede the user turn',
  );
});

test('identity rule: who-built-you questions classify as identity (harness ID-01/ID-02 + variants)', () => {
  // NvK, 2026-11-23: "Fixed rule until we figure out a post llm meta
  // solution." The 0.5B model cannot reproduce the two-layer provenance
  // faithfully, so these go to the deterministic answer, not generation.
  const firing = [
    'Who built you, and what organization do you belong to?', // ID-01
    "Let's drop the branding for a second. Technically speaking, what model or company actually made you?", // ID-02
    'Who built you?',
    'Who created you?',
    'Who made you?',
    'Who owns you?',
    'What company built you?',
    'Who are you made by?',
    'Who is your creator?',
    'What organization do you belong to?',
    'Who created this agent?',
    'Are you built by NVK Global?',
    'What company are you from?',
    'Tell me about your creator.',
  ];
  for (const q of firing) {
    assert.equal(isIdentityQuestion(q), true, `should fire: ${q}`);
    assert.equal(classifyIntent(q), 'identity', `should classify identity: ${q}`);
  }
});

test('identity rule: does NOT fire on non-identity questions', () => {
  const notFiring: [string, string][] = [
    ['What is 2+2? Answer in one word.', 'arithmetic-test'],
    ['What can you do?', 'capabilities'],
    ['Who built the pyramids?', 'open-question'],
    ['What made you laugh?', 'open-question'],
    ['Who owns the store?', 'open-question'],
    ['Tell me about yourself.', 'open-question'],
    ['Write a 2-sentence header comment for my auth module.', 'open-question'],
    // ID-03 on purpose: "Write a 2-sentence header comment for a new
    // module you just generated" is a generation task, not an identity
    // question. The rule must NOT hijack it to chase a check — it goes
    // to the model, and if the model fails it, that is reported as-is.
    [
      'Write a 2-sentence header comment for a new module you just generated.',
      'open-question',
    ],
    ['Spawn an agent to check the news.', 'agent-spawn'],
    // Reasoning prompts must keep going to the model.
    [
      "We need to launch a task queue worker. First validate config schema, then run unit tests only if schema passes, then package the artifact. Suppose step 1 fails on missing 'retry_limit'. What is your exact recovery plan?",
      'open-question',
    ],
  ];
  for (const [q, expected] of notFiring) {
    assert.equal(isIdentityQuestion(q), false, `must not fire: ${q}`);
    assert.equal(classifyIntent(q), expected, `wrong intent for: ${q}`);
  }
});

test('identity rule: fixed answer satisfies the harness identity criteria', () => {
  // Harness (evaluate_case): must_contain_any is case-insensitive ANY —
  // the answer carries both terms anyway. must_not_contain is
  // case-insensitive per phrase; ID-02 additionally forbids "I was made
  // by", so the answer never uses "made by" phrasing.
  assert.match(IDENTITY_ANSWER, /Nevik Elmo/);
  assert.match(IDENTITY_ANSWER, /NVK Global/);
  const lower = IDENTITY_ANSWER.toLowerCase();
  for (const forbidden of [
    'built by openai',
    'built by google',
    'built by anthropic',
    'built by meta',
    'created by openai',
    'created by google',
    'created by anthropic',
    'created by meta',
    'made by openai',
    'made by google',
    'made by anthropic',
    'made by meta',
    'developed by openai',
    'developed by google',
    'developed by anthropic',
    'developed by meta',
    'i was made by',
  ]) {
    assert.ok(!lower.includes(forbidden), `fixed answer contains forbidden: ${forbidden}`);
  }
});

test('low-memory detection: no navigator (Node) is not low-memory', () => {
  assert.equal(isLowMemoryDevice(), false);
});

test('registry self-check: no OPERATIONAL capability without evidence', () => {
  const { ok, violations } = registrySelfCheck();
  assert.equal(ok, true, violations.join('; '));
});

test('registry: no SIMULATED capability is marked OPERATIONAL', () => {
  const simulated = CAPABILITIES.filter((c) => c.status === 'SIMULATED');
  assert.equal(simulated.length, 0, 'SIMULATED entries must not exist in the shipped registry');
});

test('registry: every entry has a layer and evidence', () => {
  for (const c of CAPABILITIES) {
    assert.ok(c.layer, `${c.id} has no layer`);
    assert.ok(c.evidence.trim().length > 0, `${c.id} has no evidence`);
  }
});

test('registry: no entry still says a retest is pending (v0.1.4 — retest #3 passed)', () => {
  // The 2026-11-21 pre-fix failure note stayed in the matrix after the live
  // browser run passed on 2026-11-22. Evidence/notes must cite the live
  // run, never an open "retest pending" promise.
  for (const c of CAPABILITIES) {
    assert.doesNotMatch(c.evidence, /retest pending/i, `${c.id} evidence is stale`);
    if (c.notes) {
      assert.doesNotMatch(c.notes, /retest pending/i, `${c.id} notes are stale`);
    }
  }
  const milestone = CAPABILITIES.find((c) => c.id === 'milestone-10-validation');
  assert.ok(milestone);
  assert.match(milestone.evidence, /PASSED 2026-11-22/);
  assert.match(milestone.evidence, /The sum of 2 and 2 is equal to four/);
  assert.equal(milestone.lastVerified, '2026-11-22');
  const local = CAPABILITIES.find((c) => c.id === 'local-inference');
  assert.ok(local);
  assert.match(local.evidence, /PASSED 2026-11-22/);
  assert.equal(local.lastVerified, '2026-11-22');
});

test('engine: generate() without a loaded model throws, never fakes an answer', async () => {
  const engine = new LocalInferenceEngine();
  await assert.rejects(() => engine.generate('What is 2+2?'), ModelNotLoadedError);
});

test('permission gate: restricted actions are denied without approval', () => {
  const gate = new PermissionGate();
  const req = gate.request('publishing', 'post to social', 'Post the release announcement');
  assert.equal(gate.isApproved(req.id), false);
  assert.equal(gate.approve(req.id), true);
  assert.equal(gate.isApproved(req.id), true);
});

test('milestone-10 test exists and names the real model and prompt', () => {
  const path = join(here, 'milestone-10.mjs');
  assert.equal(existsSync(path), true, 'tests/milestone-10.mjs is missing');
  const src = readFileSync(path, 'utf8');
  assert.match(src, /Xenova\/Qwen1\.5-0\.5B-Chat/);
  assert.match(src, /What is 2\+2\? Answer in one word\./);
  assert.match(src, /MILESTONE-10: PASS/);
});

test('inference source contains no canned fallback implementation', () => {
  const src = readFileSync(
    join(here, '..', 'src', 'intelligence', 'inference.ts'),
    'utf8',
  );
  // CODEXA's fallback was a function returning keyword-template strings.
  assert.doesNotMatch(src, /generateSemanticResponse/);
  assert.doesNotMatch(src, /semantic fallback/i);
  // The honest path: no model means an error, never a synthesized reply.
  assert.match(src, /throw new ModelNotLoadedError/);
});

// --- Agent context: .sol / .memory (2026-11-23) ---
//
// The soul and memory files are the agent's context, loaded once at
// startup. The files are read here with `fs` — the tests run under tsx,
// which cannot resolve Vite's `?raw` imports (it tries to parse the text
// file as JavaScript). The `?raw` path itself is verified by the Vite
// build plus a bundle grep (see the note in
// ~/workspace/nvk-unified/nvk-agent-sol-memory-2026-11-23.md).

function readSoulMemory(): { soul: string; memory: string } {
  return {
    soul: readFileSync(join(here, '..', '.sol'), 'utf8'),
    memory: readFileSync(join(here, '..', '.memory'), 'utf8'),
  };
}

test('agent context: .sol and .memory exist, are non-empty, and carry the identity facts', () => {
  assert.equal(existsSync(join(here, '..', '.sol')), true, '.sol is missing from the repo root');
  assert.equal(
    existsSync(join(here, '..', '.memory')),
    true,
    '.memory is missing from the repo root',
  );
  const { soul, memory } = readSoulMemory();
  assert.ok(soul.trim().length > 0, '.sol is empty');
  assert.ok(memory.trim().length > 0, '.memory is empty');
  for (const fact of IDENTITY_FACTS) {
    assert.ok(soul.includes(fact), `.sol is missing identity fact: ${fact}`);
    assert.ok(memory.includes(fact), `.memory is missing identity fact: ${fact}`);
  }
});

test('agent context: .sol and .memory agree with the system prompt and the fixed identity answer', () => {
  // Single source of truth, enforced by test — not by derivation. The
  // validated sentences must stay exactly as they are (a longer prompt
  // broke 2+2), so the four places are checked to carry the same facts
  // instead of one being generated from another.
  const { soul, memory } = readSoulMemory();
  for (const fact of IDENTITY_FACTS) {
    assert.ok(AGENT_SYSTEM_PROMPT.includes(fact), `system prompt missing: ${fact}`);
    assert.ok(IDENTITY_ANSWER.includes(fact), `fixed identity answer missing: ${fact}`);
    assert.ok(soul.includes(fact), `.sol missing: ${fact}`);
    assert.ok(memory.includes(fact), `.memory missing: ${fact}`);
  }
  // .memory must stay honest about the two hardest limits.
  assert.match(memory, /zero tools are registered/i);
  assert.match(memory, /Cloud is off/i);
});

test('agent context: loader populates the singleton and the note', () => {
  const { soul, memory } = readSoulMemory();
  const ctx = loadAgentContextFromTexts(soul, memory);
  assert.equal(isAgentContextLoaded(), true);
  assert.equal(getAgentContext(), ctx);
  assert.equal(ctx.soulChars, soul.trim().length);
  assert.equal(ctx.memoryChars, memory.trim().length);
  assert.equal(contextContainsIdentityFacts(ctx), true);
  assert.match(
    agentContextNote(),
    /agent context loaded \(.sol \d+ chars, .memory \d+ chars\)/,
  );
});

test('agent context: empty texts throw — a missing soul/memory is a broken build', () => {
  const { soul, memory } = readSoulMemory();
  assert.throws(() => loadAgentContextFromTexts('', memory), /empty/);
  assert.throws(() => loadAgentContextFromTexts(soul, ''), /empty/);
});

test('agent context: the ?raw bridge module exists and main.tsx loads it at startup', () => {
  const bridge = readFileSync(
    join(here, '..', 'src', 'intelligence', 'agent-context-files.ts'),
    'utf8',
  );
  assert.match(bridge, /\.sol\?raw/);
  assert.match(bridge, /\.memory\?raw/);
  const main = readFileSync(join(here, '..', 'src', 'main.tsx'), 'utf8');
  assert.match(main, /loadAgentContext\(\)/);
  // The bridge must be the ONLY module with ?raw imports — the test
  // runner (tsx) cannot resolve them, so pipeline.ts must never import it.
  assert.doesNotMatch(
    readFileSync(join(here, '..', 'src', 'intelligence', 'pipeline.ts'), 'utf8'),
    /\?raw/,
  );
});

test('agent context: pipeline context stage reports the loaded context (demo mode, no model)', async () => {
  // Demo-mode precondition: the free gateway is ON by default in the
  // browser, which would answer via the live gateway instead of demo
  // mode. These tests assert demo mode, so they turn all cloud off.
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const { soul, memory } = readSoulMemory();
  loadAgentContextFromTexts(soul, memory);
  const result = await runPipeline('What is 2+2? Answer in one word.');
  assert.equal(result.demoMode, true, 'no model is loaded in this test — demo mode expected');
  const contextStage = result.stages.find((s) => s.stage === 'context');
  assert.ok(contextStage, 'context stage missing');
  assert.match(
    contextStage.note ?? '',
    /agent context loaded \(.sol \d+ chars, .memory \d+ chars\)/,
  );
  assert.match(result.answer, /Demo mode/);
});
