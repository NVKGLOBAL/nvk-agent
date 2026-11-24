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
  AGENT_RELAY_HANDLERS,
} from '../src/intelligence/relayAdapter';
import { permissionGate } from '../src/intelligence/permissions';
import { IDENTITY_ANSWER } from '../src/intelligence/pipeline';

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
