// NVK Agent — tests for the relay adapter (Sprint 8, slice 3).
// Run: npx tsx --test tests/relay-adapter.test.ts
// The handlers are tested in Node (the pipeline runs in demo mode
// there — the chat test asserts the identity answer, not a model call).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePairingCode,
  handleChatCommand,
  handleApproveCommand,
  handleRejectCommand,
  handleTaskCommand,
  handleStatusCommand,
  buildRelayStatus,
  AGENT_RELAY_HANDLERS,
  AgentRelayClient,
  AGENT_DESKTOP_ID,
} from '../src/intelligence/relayAdapter';
import { permissionGate } from '../src/intelligence/permissions';
import { IDENTITY_ANSWER } from '../src/intelligence/pipeline';
import { storeEvidence } from '../src/sovereign/evidence';

type CapturedCall = { url: string; body: Record<string, unknown> };

function fakeFetch(
  calls: CapturedCall[],
  commands: unknown[] = [],
): typeof fetch {
  return (async (url: string, init?: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ url, body });
    return { json: async () => ({ ok: true, commands }) };
  }) as unknown as typeof fetch;
}

test('the pairing code is 6 digits and never starts with 0', () => {
  for (let i = 0; i < 100; i++) {
    const code = generatePairingCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[1-9][0-9]{5}$/);
  }
});

test('approve / reject carry the owner’s decision to the permission gate', () => {
  const req = permissionGate.requestTool('web_fetch', 'fetch', 'fetch https://example.com');
  assert.equal(req.status, 'pending');
  const approved = handleApproveCommand({ approvalId: req.id });
  assert.deepEqual(approved, { approved: req.id });
  assert.equal(permissionGate.isApproved(req.id), true);
  // Approving the same request twice is refused (it is no longer pending).
  assert.equal(handleApproveCommand({ approvalId: req.id }).error !== undefined, true);
  // A missing id is an honest error, never a fabricated approval.
  assert.equal(handleApproveCommand({ approvalId: 'no-such-id' }).error !== undefined, true);
  assert.equal(handleApproveCommand({}).error !== undefined, true);

  const req2 = permissionGate.requestTool('panel_control', 'open', 'open the Flower of Life panel');
  const denied = handleRejectCommand({ approvalId: req2.id });
  assert.deepEqual(denied, { rejected: req2.id });
  assert.equal(permissionGate.isApproved(req2.id), false);
  assert.equal(handleRejectCommand({ approvalId: 'no-such-id' }).error !== undefined, true);
});

test('task commands are honestly unavailable (the Agent has no task engine yet)', () => {
  for (const cmd of ['start-task', 'pause-task', 'cancel-task']) {
    const res = handleTaskCommand(cmd, { taskId: 'task-1' });
    assert.match(String(res.error), /not available/);
    assert.equal(res.taskId, 'task-1');
  }
});

test('the chat handler runs the pipeline and returns the answer + orb states', async () => {
  const res = await handleChatCommand({ text: 'who are you' });
  // In Node the pipeline runs in demo mode, but the identity answer is
  // deterministic (the retest-14 fix) — it does not need a model.
  assert.equal(res.answer, IDENTITY_ANSWER);
  assert.ok(Array.isArray(res.orbStates));
  assert.equal(res.blocked, false);
  // Empty text is an honest no-command, never a fabricated run.
  const empty = await handleChatCommand({ text: '   ' });
  assert.equal(empty.error, 'no text was sent');
  const missing = await handleChatCommand({});
  assert.equal(missing.error, 'no text was sent');
});

test('the status handler returns the diagnostics + the pending approvals', async () => {
  const req = permissionGate.requestTool('web_search', 'search', 'search for NVK smartwatch');
  const res = await handleStatusCommand();
  assert.ok(res.overall);
  assert.ok(Array.isArray(res.checks));
  const pending = res.pendingApprovals as Array<{ id: string }>;
  assert.ok(pending.some((p) => p.id === req.id));
  // Clean up so the gate is not left pending for other tests.
  permissionGate.deny(req.id);
});

test('the handler table covers the relay command set (except evidence/history, which the Agent does not expose yet)', () => {
  for (const cmd of ['chat', 'approve', 'reject', 'status', 'start-task', 'pause-task', 'cancel-task']) {
    assert.equal(typeof AGENT_RELAY_HANDLERS[cmd], 'function');
  }
});

test('getStatus returns real diagnostics + pending approvals + recent evidence, most recent first', async () => {
  const first = await storeEvidence({
    input: 'what is 2+2',
    answer: '4',
    modelId: null,
    route: 'test',
    demoMode: true,
    intent: 'test-intent',
  });
  const second = await storeEvidence({
    input: 'who are you',
    answer: IDENTITY_ANSWER,
    modelId: null,
    route: 'test',
    demoMode: true,
    intent: 'test-intent',
  });
  const req = permissionGate.requestTool('web_search', 'search', 'search for NVK smartwatch');
  try {
    const status = await buildRelayStatus(() => ({
      orbState: 'thinking',
      model: 'Xenova/Qwen1.5-0.5B-Chat',
    }));
    assert.equal(status.orbState, 'thinking');
    assert.equal(status.model, 'Xenova/Qwen1.5-0.5B-Chat');
    // Diagnostics are the real runDiagnostics overall, not a placeholder.
    assert.ok(['pass', 'fail', 'not-wired'].includes(status.diagnostics));
    assert.ok(status.pendingApprovals.some((p) => p.id === req.id));
    // No task engine yet — an honest empty, never fabricated tasks.
    assert.deepEqual(status.tasks, []);
    // Most recent evidence first, bounded, with type/timestamp/summary.
    const newest = status.evidence[0];
    assert.equal(newest.timestamp, second.at);
    assert.equal(newest.type, 'test-intent');
    assert.ok(newest.summary.includes('who are you'));
    assert.ok(status.evidence.some((e) => e.timestamp === first.at));
    assert.ok(status.evidence.length <= 10);
  } finally {
    permissionGate.deny(req.id);
  }
});

test('postStatus posts the live status to /desktop/status', async () => {
  const calls: CapturedCall[] = [];
  const client = new AgentRelayClient({
    relayUrl: 'https://relay.example/',
    desktopId: AGENT_DESKTOP_ID,
    desktopToken: 'tok',
    getLiveStatus: () => ({ orbState: 'idle', model: 'none loaded' }),
    fetchImpl: fakeFetch(calls),
  });
  await client.postStatus();
  const statusCall = calls.find((c) => c.url.endsWith('/desktop/status'));
  assert.ok(statusCall, 'expected a call to /desktop/status');
  assert.equal(statusCall.body.desktopId, 'nvk-agent');
  const status = statusCall.body.status as Record<string, unknown>;
  assert.equal(status.model, 'none loaded');
  assert.equal(status.orbState, 'idle');
  assert.deepEqual(status.tasks, []);
});

test('pollOnce posts the live status after handling commands', async () => {
  const calls: CapturedCall[] = [];
  const client = new AgentRelayClient({
    relayUrl: 'https://relay.example',
    desktopId: AGENT_DESKTOP_ID,
    desktopToken: 'tok',
    getLiveStatus: () => ({ orbState: 'idle', model: 'none loaded' }),
    fetchImpl: fakeFetch(calls, []),
  });
  const res = await client.pollOnce();
  assert.equal(res.ok, true);
  const commandsIdx = calls.findIndex((c) => c.url.endsWith('/desktop/commands'));
  const statusIdx = calls.findIndex((c) => c.url.endsWith('/desktop/status'));
  assert.ok(commandsIdx >= 0, 'expected a commands fetch');
  assert.ok(statusIdx > commandsIdx, 'expected the status post after the commands fetch');
});

test('registerPairing sends the code + the owner-chosen permissions', async () => {
  const calls: CapturedCall[] = [];
  const client = new AgentRelayClient({
    relayUrl: 'https://relay.example',
    desktopId: AGENT_DESKTOP_ID,
    desktopToken: 'tok',
    fetchImpl: fakeFetch(calls),
  });
  await client.registerPairing('123456', ['monitor', 'approve']);
  const call = calls.find((c) => c.url.endsWith('/desktop/register-pairing'));
  assert.ok(call);
  assert.equal(call.body.code, '123456');
  assert.deepEqual(call.body.permissions, ['monitor', 'approve']);
});

test('start / stop report the running state the UI reads', () => {
  const client = new AgentRelayClient({
    relayUrl: 'https://relay.example',
    desktopId: AGENT_DESKTOP_ID,
    desktopToken: 'tok',
    pollMs: 60_000,
  });
  assert.equal(client.isRunning(), false);
  client.start();
  assert.equal(client.isRunning(), true);
  client.start(); // second start is a no-op, not a second loop
  assert.equal(client.isRunning(), true);
  client.stop();
  assert.equal(client.isRunning(), false);
});
