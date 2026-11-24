/**
 * NVK Agent — persisted run traces tests (MCNA slice 7, telemetry).
 *
 * Run: npm test
 *
 * The in-memory 20-event ring buffer is replaced by durable records: a
 * run trace carries the token counts, latency, route, model, tool calls,
 * quota use, and outcome of one run. In Node there is no localStorage,
 * so these tests exercise the in-memory store (the persistence is
 * guarded and best-effort).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RunTraceStore } from '../src/intelligence/runTrace';
import type { RunTrace } from '../src/intelligence/runTrace';

function trace(id: string): RunTrace {
  return {
    id,
    startedAt: 1000,
    endedAt: 1500,
    latencyMs: 500,
    route: 'local',
    model: 'Qwen1.5-0.5B-Chat',
    tokens: 120,
    toolCalls: ['diagnostics'],
    quota: null,
    outcome: 'ok',
    error: null,
  };
}

test('record + list + get', () => {
  const store = new RunTraceStore();
  store.record(trace('t1'));
  store.record(trace('t2'));
  assert.equal(store.list().length, 2);
  assert.equal(store.list()[0].id, 't2'); // most recent first
  assert.equal(store.get('t1')?.model, 'Qwen1.5-0.5B-Chat');
  assert.equal(store.get('missing'), undefined);
});

test('cap: the store keeps at most 100 traces (oldest dropped first)', () => {
  const store = new RunTraceStore();
  for (let i = 0; i < 105; i++) store.record(trace(`t${i}`));
  assert.equal(store.list().length, 100);
  assert.equal(store.list()[0].id, 't104');
  assert.equal(store.get('t0'), undefined);
});

test('clear empties the store', () => {
  const store = new RunTraceStore();
  store.record(trace('t1'));
  store.clear();
  assert.equal(store.list().length, 0);
});
