/**
 * NVK Agent — voice command path tests (Sprint 7 / slice 9).
 *
 * The voice path is a command path: a spoken command (the transcript)
 * reaches the SAME pipeline as a typed one, and the confirmation is
 * spoken back. The orb state trace cites real pipeline stage events.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { handleVoiceCommand } from '../src/intelligence/voice';

test('voice: a spoken status command runs the pipeline and returns a speakable confirmation', async () => {
  const result = await handleVoiceCommand('what is the status');
  assert.ok(result.answer.length > 0, 'the pipeline answers');
  assert.ok(result.speakText.length > 0, 'there is a confirmation to speak');
  assert.ok(result.orbStates.length > 0, 'the orb trace is not empty');
  // The trace cites real stages: it starts by listening and ends
  // complete (a status-check runs diagnostics, then completes).
  assert.equal(result.orbStates[0], 'listening');
  assert.equal(result.orbStates[result.orbStates.length - 1], 'complete');
  assert.equal(result.blocked, false);
});

test('voice: the orb trace follows the pipeline order (listening → thinking → planning → executing → verifying → complete)', async () => {
  const result = await handleVoiceCommand('what is the status');
  const order = ['listening', 'thinking', 'planning', 'executing', 'verifying', 'complete'];
  // Every state in the trace is one of the real orb states, and the
  // trace never goes backwards in pipeline order.
  let lastIndex = -1;
  for (const state of result.orbStates) {
    const index = order.indexOf(state);
    assert.ok(index >= 0, `${state} is a real orb state`);
    assert.ok(index >= lastIndex, `the trace never goes backwards (${state} after ${order[lastIndex]})`);
    lastIndex = index;
  }
});

test('voice: an empty transcript is an honest no-command (never a fabricated run)', async () => {
  const result = await handleVoiceCommand('   ');
  assert.equal(result.answer, 'I did not hear a command.');
  assert.equal(result.speakText, 'I did not hear a command.');
  assert.deepEqual(result.orbStates, ['idle']);
  assert.equal(result.blocked, false);
});

test('voice: a spoken search command plans a web_search node (the same as a typed one)', async () => {
  const result = await handleVoiceCommand('search for NVK smartwatch');
  assert.ok(result.pipeline.stages.some((e) => e.stage === 'planning'), 'the pipeline planned');
  const planning = result.pipeline.stages.find((e) => e.stage === 'planning');
  assert.ok(planning?.note.includes('web-search'), `the plan includes web-search, got: ${planning?.note}`);
});
