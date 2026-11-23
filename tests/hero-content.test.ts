/**
 * NVK Agent — first-screen hero + empty-turn tests.
 *
 * Run: npm test
 *
 * 1. The hero may only advertise capabilities the registry says are
 *    OPERATIONAL or PARTIAL. Vision, web search, file analysis and agent
 *    workflows are not implemented and must never appear here.
 * 2. Empty conversation turns are never stored — the pre-fix engine's empty
 *    agent replies persisted as broken-looking blank bubbles.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CAPABILITIES } from '../src/intelligence/capability-registry';
import { HERO_CAPABILITIES, EXAMPLE_PROMPTS } from '../src/experience/hero-content';
import { MemoryStore } from '../src/intelligence/memory';

test('hero: every listed capability is OPERATIONAL or PARTIAL in the registry', () => {
  assert.ok(HERO_CAPABILITIES.length >= 3, 'hero lists too few capabilities');
  for (const item of HERO_CAPABILITIES) {
    const cap = CAPABILITIES.find((c) => c.id === item.capabilityId);
    assert.ok(cap, `hero lists unknown capability ${item.capabilityId}`);
    assert.ok(
      cap.status === 'OPERATIONAL' || cap.status === 'PARTIAL',
      `hero lists ${item.capabilityId} but it is ${cap.status}`,
    );
    assert.ok(item.title.trim().length > 0, `${item.capabilityId} has no title`);
    assert.ok(item.detail.trim().length > 0, `${item.capabilityId} has no detail`);
    assert.ok(item.panel, `${item.capabilityId} has no panel`);
  }
});

test('hero: no BLOCKED or MISSING capability is advertised', () => {
  const advertised = new Set(HERO_CAPABILITIES.map((c) => c.capabilityId));
  for (const cap of CAPABILITIES) {
    if (cap.status === 'BLOCKED' || cap.status === 'MISSING' || cap.status === 'SIMULATED') {
      assert.ok(!advertised.has(cap.id), `hero advertises ${cap.id} (${cap.status})`);
    }
  }
});

test('hero: example prompts are real, non-empty questions', () => {
  assert.ok(EXAMPLE_PROMPTS.length >= 2, 'need at least 2 example prompts');
  for (const p of EXAMPLE_PROMPTS) {
    assert.ok(p.trim().length > 0, 'empty example prompt');
  }
});

test('memory: empty turns are never stored', async () => {
  const store = new MemoryStore();
  await store.appendTurn({ role: 'agent', text: '   ', at: Date.now() });
  await store.appendTurn({ role: 'agent', text: '', at: Date.now() });
  await store.appendTurn({ role: 'user', text: 'What is 2+2?', at: Date.now() });
  await store.appendTurn({
    role: 'agent',
    text: 'Two plus two equals four.',
    at: Date.now(),
  });
  const turns = await store.getConversation();
  assert.equal(turns.length, 2, 'empty turns leaked into storage');
  assert.equal(turns[1].text, 'Two plus two equals four.');
});
