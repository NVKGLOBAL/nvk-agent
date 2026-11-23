/**
 * NVK Agent — conversation-history prune tests (v0.1.4).
 *
 * Run: npm test
 *
 * Retest #3 found the persisted history showing "What is 2+2? Answer in
 * one word." four times with only two replies — the first reply was "1"
 * (wrong), two prompts had no reply at all. pruneConversation() cleans
 * that stale history at read time (and as it grows). The 10-minute rule
 * for a trailing orphan prompt is load-bearing: the pipeline appends the
 * user turn first and the agent reply second, so pruning a FRESH trailing
 * prompt would delete the user's question before its answer lands.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pruneConversation } from '../src/intelligence/memory';
import type { ConversationTurn } from '../src/intelligence/memory';

const NOW = Date.now();
const PROMPT = 'What is 2+2? Answer in one word.';
const CORRECT = 'The sum of 2 and 2 is equal to four.';

function turn(role: 'user' | 'agent', text: string, at: number = NOW): ConversationTurn {
  return { role, text, at };
}

// The exact stale history from retest #3: four identical prompts, two
// replies, the first one wrong, two prompts unanswered.
function staleHistory(): ConversationTurn[] {
  const t = NOW - 60 * 60 * 1000; // an hour old — safely stale
  return [
    turn('user', PROMPT, t),
    turn('agent', '1', t + 1000),
    turn('user', PROMPT, t + 2000),
    turn('agent', CORRECT, t + 3000),
    turn('user', PROMPT, t + 4000),
    turn('user', PROMPT, t + 5000),
  ];
}

test('prune: the retest-#3 stale history collapses to one prompt + the correct reply', () => {
  const t = NOW - 60 * 60 * 1000;
  const pruned = pruneConversation(staleHistory());
  // '1' dropped; the two leading duplicate prompts collapse to the one
  // before the correct reply; the two trailing orphan prompts collapse
  // and, being stale, are dropped.
  assert.deepEqual(pruned, [
    turn('user', PROMPT, t + 2000),
    turn('agent', CORRECT, t + 3000),
  ]);
});

test('prune: empty agent turns are dropped', () => {
  const pruned = pruneConversation([
    turn('user', 'Hello', NOW - 1000),
    turn('agent', '', NOW - 900),
    turn('agent', '   ', NOW - 800),
    turn('user', 'Are you there?', NOW - 700),
    turn('agent', 'Yes.', NOW - 600),
  ]);
  assert.equal(pruned.length, 3);
  assert.equal(pruned[1].text, 'Are you there?');
});

test('prune: the wrong "1" reply is dropped', () => {
  const pruned = pruneConversation([
    turn('user', PROMPT, NOW - 1000),
    turn('agent', '1', NOW - 900),
    turn('user', 'What is 3+3?', NOW - 800),
    turn('agent', '6', NOW - 700),
  ]);
  assert.equal(pruned.length, 3);
  assert.equal(pruned[0].text, PROMPT);
  assert.equal(pruned[1].text, 'What is 3+3?');
});

test('prune: a stale trailing orphan prompt is dropped, a fresh one is kept', () => {
  const stale = pruneConversation([
    turn('user', 'Hello', NOW - 20 * 60 * 1000),
    turn('agent', 'Hi.', NOW - 20 * 60 * 1000 + 1000),
    turn('user', 'Are you still there?', NOW - 20 * 60 * 1000),
  ]);
  assert.equal(stale.length, 2, 'stale orphan must go');

  const fresh = pruneConversation([
    turn('user', 'Hello', NOW - 1000),
    turn('agent', 'Hi.', NOW - 900),
    turn('user', 'What is 2+2?', NOW - 100),
  ]);
  assert.equal(fresh.length, 3, 'fresh trailing prompt is the question awaiting its answer');
});

test('prune: a legitimate history is untouched', () => {
  const history = [
    turn('user', 'Hello', NOW - 3000),
    turn('agent', 'Hi there.', NOW - 2000),
    turn('user', 'What is 2+2?', NOW - 1000),
    turn('agent', CORRECT, NOW),
  ];
  assert.deepEqual(pruneConversation(history), history);
});

test('prune: idempotent — pruning a pruned history changes nothing', () => {
  const once = pruneConversation(staleHistory());
  assert.deepEqual(pruneConversation(once), once);
});
