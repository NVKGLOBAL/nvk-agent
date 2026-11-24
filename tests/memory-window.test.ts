/**
 * NVK Agent — bounded history window tests (MCNA slice 4, memory).
 *
 * Run: npm test
 *
 * Slice 4: memory is read into prompts in a bounded window, or it is not
 * memory — it is a log. buildHistoryTranscript() takes the most recent
 * turns (newest first so the most recent survive a cap) under a token cap
 * enforced in code. It returns '' when there is no history, so a first
 * turn is byte-identical to before — the validated 2+2 path is untouched
 * on a fresh conversation (a longer prompt broke it, 2026-11-23).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHistoryTranscript } from '../src/intelligence/memory';
import type { ConversationTurn } from '../src/intelligence/memory';

const NOW = Date.now();

function turn(role: 'user' | 'agent', text: string, at: number = NOW): ConversationTurn {
  return { role, text, at };
}

test('empty history returns empty string (first turn unchanged)', () => {
  assert.equal(buildHistoryTranscript([]), '');
  assert.equal(buildHistoryTranscript([], { maxTurns: 4, maxTokens: 512 }), '');
});

test('multi-turn: a turn from two turns ago is included', () => {
  const turns = [
    turn('user', 'My favorite color is blue.'),
    turn('agent', 'Noted — blue it is.'),
    turn('user', 'What is the capital of France?'),
    turn('agent', 'Paris.'),
  ];
  const out = buildHistoryTranscript(turns);
  assert.match(out, /My favorite color is blue/);
  assert.match(out, /Paris/);
  assert.match(out, /Earlier in this conversation/);
  // Roles are labelled.
  assert.match(out, /User: My favorite color is blue/);
  assert.match(out, /Assistant: Paris/);
});

test('cap: a 100-turn history still fits the token budget (bounded)', () => {
  const turns = Array.from({ length: 100 }, (_, i) =>
    turn(i % 2 === 0 ? 'user' : 'agent', `Turn ${i} — ${'x'.repeat(200)}`),
  );
  const out = buildHistoryTranscript(turns, { maxTurns: 10, maxTokens: 100 });
  // ~50 tokens per turn, cap 100 → only ~2 turns fit.
  assert.ok(out.length < 100 * 60, 'window must be bounded');
  assert.match(out, /Turn 99/);
  assert.doesNotMatch(out, /Turn 0 —/);
});

test('empty and whitespace turns are skipped', () => {
  const turns = [
    turn('user', '   '),
    turn('agent', ''),
    turn('user', 'Hello.'),
  ];
  const out = buildHistoryTranscript(turns);
  assert.match(out, /Hello/);
  assert.doesNotMatch(out, /Assistant: $/m);
});
