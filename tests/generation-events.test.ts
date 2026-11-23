/**
 * NVK Agent — generation-events tests (v0.1.4).
 *
 * Run: npm test
 *
 * Retest #3: after a live generation the Visualizations section still said
 * "No generation events yet — run the agent and resonance effects will
 * appear here." The panel only received `result` stage events while it was
 * mounted; a run from Chat was lost. The pipeline now keeps the last 20
 * completed runs in memory (getGenerationEvents), and the panel seeds from
 * them on mount. These tests assert the record exists and the mapping to a
 * resonance effect is honest (demo runs carry no tok/s and read as such).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { runPipeline, getGenerationEvents } from '../src/intelligence/pipeline';
import { resonanceEffectFromGeneration } from '../src/experience/visualizers/types';

test('generation events: none recorded before any run', () => {
  assert.deepEqual(getGenerationEvents(), []);
});

test('generation events: a demo-mode runPipeline records one event with stages', async () => {
  const result = await runPipeline('What is 2+2?');
  assert.equal(result.demoMode, true, 'no model is loaded in the test process');

  const events = getGenerationEvents();
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.demoMode, true);
  assert.equal(ev.modelId, null);
  assert.equal(ev.tokensPerSecond, null);
  assert.ok(ev.elapsedMs >= 0);
  assert.ok(ev.at > 0);
  const stages = ev.stages.map((s) => s.stage);
  assert.ok(stages.includes('input'), `stages missing input: ${stages}`);
  assert.ok(stages.includes('result'), `stages missing result: ${stages}`);
  assert.ok(stages.length >= 5, `too few stages recorded: ${stages}`);
});

test('resonance mapping: demo event reads as demo mode, zero intensity', () => {
  const ev = {
    id: 'gen-1',
    at: Date.now(),
    modelId: null,
    tokensPerSecond: null,
    elapsedMs: 1234,
    demoMode: true,
  };
  const fx = resonanceEffectFromGeneration(ev);
  assert.equal(fx.source, 'demo mode');
  assert.equal(fx.intensity, 0);
  assert.equal(fx.duration, '1.2');
  assert.match(fx.text, /Demo-mode/);
});

test('resonance mapping: real run scales intensity from tok/s and names the model', () => {
  const ev = {
    id: 'gen-2',
    at: Date.now(),
    modelId: 'Xenova/Qwen1.5-0.5B-Chat',
    tokensPerSecond: 25,
    elapsedMs: 2976,
    demoMode: false,
  };
  const fx = resonanceEffectFromGeneration(ev);
  assert.equal(fx.source, 'Xenova/Qwen1.5-0.5B-Chat');
  assert.equal(fx.intensity, 0.5);
  assert.equal(fx.duration, '3.0');
  // Capped at 1 even for very fast runs.
  const fast = resonanceEffectFromGeneration({ ...ev, tokensPerSecond: 500 });
  assert.equal(fast.intensity, 1);
});
