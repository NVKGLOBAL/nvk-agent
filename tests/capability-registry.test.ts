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
import { LocalInferenceEngine, ModelNotLoadedError } from '../src/intelligence/inference';
import { PermissionGate } from '../src/intelligence/permissions';

const here = dirname(fileURLToPath(import.meta.url));

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
