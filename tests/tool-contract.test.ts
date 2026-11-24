/**
 * NVK Agent — tool contract tests (MCNA slice 1).
 *
 * Run: npm test
 *
 * Architecture §6 + §15 (Experiment 001 controlled tasks): the registry
 * is the only way the agent acts. Slice 1 registers three read-only
 * tools that return real values from real code (diagnostics, memory_read,
 * evidence_lookup) plus panel_control (schema + gating; no bus in this
 * slice, so it returns honest unavailable). Permission is per call
 * through the existing permission gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { toolRegistry, attachPanelBus } from '../src/intelligence/tools';
import { permissionGate } from '../src/intelligence/permissions';
import { memoryStore } from '../src/intelligence/memory';
import { storeEvidence } from '../src/sovereign/evidence';
import { runPipeline } from '../src/intelligence/pipeline';

/* ------------------------------------------------------------------ */
/* Registry + schemas                                                  */
/* ------------------------------------------------------------------ */

test('tool contract: the first four tools are registered with full schemas', () => {
  for (const name of ['diagnostics', 'memory_read', 'evidence_lookup', 'panel_control']) {
    const tool = toolRegistry.get(name);
    assert.ok(tool, `tool '${name}' must be registered`);
    assert.ok(tool!.description.length > 0, `${name}: description required`);
    assert.ok(tool!.inputs !== undefined, `${name}: inputs required`);
    assert.ok(tool!.outputs !== undefined, `${name}: outputs required`);
    assert.ok(
      ['none', 'confirm', 'approve'].includes(tool!.permission),
      `${name}: permission must be none|confirm|approve`,
    );
    assert.ok(
      ['none', 'read', 'write', 'external'].includes(tool!.sideEffects),
      `${name}: sideEffects must be none|read|write|external`,
    );
    assert.ok(tool!.evidence.length > 0, `${name}: evidence format required`);
    assert.ok(tool!.unavailableWhen.length > 0, `${name}: unavailableWhen required`);
  }
  // The three read-only tools need no approval; panel_control is gated.
  assert.equal(toolRegistry.get('diagnostics')!.permission, 'none');
  assert.equal(toolRegistry.get('memory_read')!.permission, 'none');
  assert.equal(toolRegistry.get('evidence_lookup')!.permission, 'none');
  assert.equal(toolRegistry.get('diagnostics')!.sideEffects, 'read');
  assert.equal(toolRegistry.get('memory_read')!.sideEffects, 'read');
  assert.equal(toolRegistry.get('evidence_lookup')!.sideEffects, 'read');
  assert.equal(toolRegistry.get('panel_control')!.permission, 'confirm');
});

test('tool contract: unknown tools are refused, never run', async () => {
  await assert.rejects(
    toolRegistry.execute('does-not-exist', {}),
    /Unknown tool: does-not-exist/,
  );
});

/* ------------------------------------------------------------------ */
/* diagnostics — real measured values                                  */
/* ------------------------------------------------------------------ */

test('diagnostics tool: returns measured values, not canned numbers', async () => {
  const report = (await toolRegistry.execute('diagnostics', {})) as {
    at: number;
    overall: string;
    checks: Array<{ name: string; result: string; detail: string }>;
  };
  assert.ok(report.at > 0);
  assert.ok(['pass', 'fail', 'not-wired'].includes(report.overall));
  assert.ok(report.checks.length >= 6, `expected >= 6 checks, got ${report.checks.length}`);
  for (const check of report.checks) {
    assert.ok(check.name.length > 0);
    assert.ok(['pass', 'fail', 'not-wired'].includes(check.result));
    assert.ok(check.detail.length > 0, `${check.name}: detail required`);
  }
  // Model state is measured: no model is loaded in the test process.
  const modelCheck = report.checks.find((c) => c.name === 'Local model loaded');
  assert.ok(modelCheck, 'model-loaded check must exist');
  assert.equal(modelCheck!.result, 'fail');
  assert.match(modelCheck!.detail, /No model loaded/);
  // Outbound requests are counted, not asserted: nothing has left this device.
  const outbound = report.checks.find((c) => c.name.startsWith('Outbound network'));
  assert.ok(outbound, 'outbound check must exist');
  assert.match(outbound!.detail, /0 requests/);
});

/* ------------------------------------------------------------------ */
/* memory_read — real turns, bounded, honest empty                     */
/* ------------------------------------------------------------------ */

test('memory_read tool: returns stored turns', async () => {
  await memoryStore.appendTurn({ role: 'user', text: 'MCNA recall marker alpha', at: Date.now() });
  await memoryStore.appendTurn({ role: 'agent', text: 'MCNA recall marker beta', at: Date.now() });
  const result = (await toolRegistry.execute('memory_read', {})) as {
    found: boolean;
    turns: Array<{ role: string; text: string }>;
    total: number;
  };
  assert.equal(result.found, true);
  assert.ok(result.total >= 2);
  assert.ok(result.turns.some((t) => t.text === 'MCNA recall marker alpha'));
  assert.ok(result.turns.some((t) => t.text === 'MCNA recall marker beta'));
});

test('memory_read tool: query filter and limit are honoured', async () => {
  const filtered = (await toolRegistry.execute('memory_read', {
    query: 'recall marker alpha',
  })) as { found: boolean; turns: Array<{ text: string }> };
  assert.equal(filtered.found, true);
  assert.equal(filtered.turns.length, 1);
  assert.equal(filtered.turns[0].text, 'MCNA recall marker alpha');

  const limited = (await toolRegistry.execute('memory_read', { limit: 1 })) as {
    turns: Array<{ text: string }>;
  };
  assert.equal(limited.turns.length, 1);
});

test('memory_read tool: no match is an honest empty, not an error', async () => {
  const result = (await toolRegistry.execute('memory_read', {
    query: 'no-such-marker-anywhere-xyz',
  })) as { found: boolean; turns: unknown[]; reason?: string };
  assert.equal(result.found, false);
  assert.deepEqual(result.turns, []);
  assert.ok(result.reason && result.reason.length > 0);
});

/* ------------------------------------------------------------------ */
/* evidence_lookup — re-verifies, catches tampering                    */
/* ------------------------------------------------------------------ */

test('evidence_lookup tool: verifies a genuine record', async () => {
  const record = await storeEvidence({
    input: 'evidence lookup genuine',
    answer: 'verified.',
    modelId: null,
    route: 'demo',
    demoMode: true,
    intent: 'open-question',
  });
  const byId = (await toolRegistry.execute('evidence_lookup', { id: record.id })) as {
    found: boolean;
    verified: boolean;
    record: { id: string };
  };
  assert.equal(byId.found, true);
  assert.equal(byId.verified, true);
  assert.equal(byId.record.id, record.id);

  const byHash = (await toolRegistry.execute('evidence_lookup', { hash: record.sha256 })) as {
    found: boolean;
    verified: boolean;
  };
  assert.equal(byHash.found, true);
  assert.equal(byHash.verified, true);
});

test('evidence_lookup tool: an unknown id is found:false, never invented', async () => {
  const result = (await toolRegistry.execute('evidence_lookup', { id: 'ev-no-such-id' })) as {
    found: boolean;
    verified: boolean;
  };
  assert.equal(result.found, false);
  assert.equal(result.verified, false);
});

/* ------------------------------------------------------------------ */
/* Permission gating — per call, through the existing gate             */
/* ------------------------------------------------------------------ */

test('permission gating: a confirm-level panel_control write is denied without approval', async () => {
  attachPanelBus(null);
  await assert.rejects(
    toolRegistry.execute('panel_control', { action: 'set', panelId: 'flower-of-life', property: 'color', value: 'green' }),
    /requires explicit owner authorization \(confirm\)/,
  );
});

test('permission gating: the same write with approval reaches the tool — and the tool is honestly unavailable', async () => {
  attachPanelBus(null);
  const req = permissionGate.requestTool('panel_control', 'set', 'set flower-of-life color to green');
  assert.equal(permissionGate.approve(req.id), true);
  const result = (await toolRegistry.execute(
    'panel_control',
    { action: 'set', panelId: 'flower-of-life', property: 'color', value: 'green' },
    { approvalId: req.id },
  )) as { available: boolean; reason?: string };
  // Approval gates the CALL; availability is the tool's own honest answer.
  assert.equal(result.available, false);
  assert.equal(result.reason, 'no panel bus attached');
});

test('permission gating: panel_control reads need no approval', async () => {
  attachPanelBus(null);
  const result = (await toolRegistry.execute('panel_control', { action: 'list' })) as {
    available: boolean;
    reason?: string;
  };
  assert.equal(result.available, false);
  assert.equal(result.reason, 'no panel bus attached');
});

test('panel_control: with no bus attached it never reports a fake success', async () => {
  attachPanelBus(null);
  // Reads need no approval: every one reports unavailable, never success.
  for (const action of ['list', 'get']) {
    const input: Record<string, unknown> =
      action === 'list' ? { action } : { action, panelId: 'flower-of-life' };
    const result = (await toolRegistry.execute('panel_control', input)) as {
      available: boolean;
      ok?: boolean;
    };
    assert.equal(result.available, false, `${action} must not claim availability`);
    assert.notEqual(result.ok, true, `${action} must not claim success`);
  }
  // Writes need approval first; with approval they still report
  // unavailable (no bus), never a fake success.
  for (const action of ['open', 'close', 'focus']) {
    const req = permissionGate.requestTool('panel_control', action, `test ${action}`);
    assert.equal(permissionGate.approve(req.id), true);
    const result = (await toolRegistry.execute(
      'panel_control',
      { action, panelId: 'flower-of-life' },
      { approvalId: req.id },
    )) as { available: boolean; ok?: boolean };
    assert.equal(result.available, false, `${action} must not claim availability`);
    assert.notEqual(result.ok, true, `${action} must not claim success`);
  }
});

/* ------------------------------------------------------------------ */
/* Pipeline capability stage consults the ToolRegistry                 */
/* ------------------------------------------------------------------ */

test('pipeline: the capability stage consults the ToolRegistry', async () => {
  const result = await runPipeline('status check please');
  const capStage = result.stages.find((s) => s.stage === 'capability');
  assert.ok(capStage, 'capability stage must exist');
  assert.match(capStage!.note ?? '', /tools registered: diagnostics, memory_read, evidence_lookup, panel_control/);
});

/* ------------------------------------------------------------------ */
/* Experiment 001 controlled tasks (§15): ground-truth checkers        */
/* ------------------------------------------------------------------ */

test('experiment-001: tampered-hash evidence check — ground truth: tampering is caught', async () => {
  // Ground truth: input '2+2', answer '4', stored with a real SHA-256.
  const record = await storeEvidence({
    input: 'What is 2+2?',
    answer: 'Four.',
    modelId: null,
    route: 'demo',
    demoMode: true,
    intent: 'arithmetic-test',
  });
  const before = (await toolRegistry.execute('evidence_lookup', { id: record.id })) as {
    verified: boolean;
  };
  assert.equal(before.verified, true, 'untampered record must verify');

  // Tamper: change the stored answer without updating the hash.
  const all = (await memoryStore.get<any[]>('evidence')) ?? [];
  await memoryStore.set(
    'evidence',
    all.map((r) => (r.id === record.id ? { ...r, answer: 'Five.' } : r)),
  );
  const after = (await toolRegistry.execute('evidence_lookup', { id: record.id })) as {
    found: boolean;
    verified: boolean;
    detail: string;
  };
  assert.equal(after.found, true, 'the record still exists');
  assert.equal(after.verified, false, 'ground truth: a tampered hash must NOT verify');
  assert.match(after.detail, /FAIL/);
});

test('experiment-001: memory-recall check — ground truth: stored turns come back verbatim', async () => {
  // Store N turns with known ground truth, then ask for one back.
  const groundTruth = [
    { role: 'user' as const, text: 'EXP001 ground truth turn one' },
    { role: 'agent' as const, text: 'EXP001 ground truth reply one' },
    { role: 'user' as const, text: 'EXP001 ground truth turn two' },
    { role: 'agent' as const, text: 'EXP001 ground truth reply two' },
  ];
  for (const turn of groundTruth) {
    await memoryStore.appendTurn({ ...turn, at: Date.now() });
  }
  const recalled = (await toolRegistry.execute('memory_read', {
    query: 'EXP001 ground truth turn two',
    limit: 10,
  })) as { found: boolean; turns: Array<{ role: string; text: string }> };
  assert.equal(recalled.found, true);
  assert.equal(recalled.turns.length, 1);
  assert.equal(recalled.turns[0].text, 'EXP001 ground truth turn two');
  assert.equal(recalled.turns[0].role, 'user');

  // The full recall returns every stored ground-truth turn verbatim.
  const all = (await toolRegistry.execute('memory_read', { limit: 100 })) as {
    turns: Array<{ text: string }>;
  };
  for (const turn of groundTruth) {
    assert.ok(
      all.turns.some((t) => t.text === turn.text),
      `stored turn missing from recall: ${turn.text}`,
    );
  }
});
