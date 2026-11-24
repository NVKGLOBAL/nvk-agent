/**
 * NVK Agent — checkpoint / rollback tests (MCNA slice 11).
 *
 * A state-changing tool call snapshots the relevant state first; a
 * failure restores the snapshot; a success commits (discards) it. The
 * panel_control tool (the only state-changing tool) snapshots the
 * panel before a state-changing action and restores it when the action
 * fails — the panel is never left half-changed.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CheckpointStore, withCheckpoint } from '../src/intelligence/checkpoint';
import {
  toolRegistry,
  attachPanelBus,
  restorePanelSnapshot,
  type PanelBus,
  type PanelInfo,
} from '../src/intelligence/tools';
import { permissionGate } from '../src/intelligence/permissions';

/* ------------------------------------------------------------------ */
/* CheckpointStore + withCheckpoint                                    */
/* ------------------------------------------------------------------ */

test('checkpoint: snapshot + restore returns the pre-change state', () => {
  const store = new CheckpointStore<{ a: number; b: string }>();
  const state = { a: 1, b: 'x' };
  const id = store.snapshot(state);
  state.a = 99;
  state.b = 'changed';
  assert.deepEqual(store.restore(id), { a: 1, b: 'x' });
});

test('checkpoint: the snapshot is a deep copy (later mutation cannot corrupt it)', () => {
  const store = new CheckpointStore<{ nested: { v: number } }>();
  const state = { nested: { v: 1 } };
  const id = store.snapshot(state);
  state.nested.v = 42;
  assert.deepEqual(store.restore(id), { nested: { v: 1 } });
});

test('checkpoint: commit discards the checkpoint', () => {
  const store = new CheckpointStore<{ a: number }>();
  const id = store.snapshot({ a: 1 });
  assert.equal(store.has(id), true);
  store.commit(id);
  assert.equal(store.has(id), false);
  assert.equal(store.count(), 0);
});

test('checkpoint: restore of a missing checkpoint throws (never silently skipped)', () => {
  const store = new CheckpointStore<{ a: number }>();
  assert.throws(() => store.restore('ckpt-does-not-exist'), /does not exist/);
});

test('checkpoint: a successful call commits the checkpoint (no restore)', async () => {
  const store = new CheckpointStore<{ a: number }>();
  const state = { a: 1 };
  const result = await withCheckpoint(store, state, async () => {
    state.a = 2;
  });
  assert.equal(result.restored, false);
  assert.equal(store.count(), 0);
  assert.equal(state.a, 2);
});

test('checkpoint: a failed call restores the snapshot into the live state and rethrows', async () => {
  const store = new CheckpointStore<{ a: number }>();
  const state = { a: 1 };
  await assert.rejects(
    withCheckpoint(store, state, async () => {
      state.a = 99;
      throw new Error('tool failed');
    }),
    /tool failed/,
  );
  // The live state is the pre-change state again (the restore is real).
  assert.equal(state.a, 1);
  assert.equal(store.count(), 0);
});

/* ------------------------------------------------------------------ */
/* panel_control checkpoint / rollback                                 */
/* ------------------------------------------------------------------ */

// A fake PanelBus whose `setPanelProperty` FAILS after partially
// applying (it sets the property, then returns false) — the rollback
// must undo the partial change.
function makeFailingBus(): { bus: PanelBus; panels: Map<string, PanelInfo> } {
  const panels = new Map<string, PanelInfo>();
  panels.set('flower', {
    id: 'flower',
    name: 'Flower of Life',
    open: true,
    properties: { color: 'green', size: 1 },
  });
  const bus: PanelBus = {
    listPanels: () => Array.from(panels.values()),
    getPanel: (id) => {
      const p = panels.get(id);
      return p ? { ...p, properties: { ...p.properties } } : null;
    },
    openPanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = true;
      return true;
    },
    closePanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = false;
      return true;
    },
    focusPanel: () => true,
    // FAILING: applies the change, then reports failure.
    setPanelProperty: (id, property, value) => {
      const p = panels.get(id);
      if (!p) return false;
      p.properties[property] = value;
      return false;
    },
  };
  return { bus, panels };
}

test('panel_control: a failed set restores the pre-call panel state', async () => {
  const { bus, panels } = makeFailingBus();
  attachPanelBus(bus);
  try {
    const approval = permissionGate.requestTool('panel_control', 'set', 'test: set flower color to red');
    permissionGate.approve(approval.id);
    const result = (await toolRegistry.execute(
      'panel_control',
      { action: 'set', panelId: 'flower', property: 'color', value: 'red' },
      { approvalId: approval.id },
    )) as { available: boolean; ok: boolean; restored?: boolean };
    assert.equal(result.ok, false, 'the failing set must report ok: false');
    assert.equal(result.restored, true, 'the failure must report restored: true');
    // The partial change (color: red) is rolled back to the snapshot.
    assert.equal(panels.get('flower')!.properties.color, 'green');
    assert.equal(panels.get('flower')!.open, true);
  } finally {
    attachPanelBus(null);
  }
});

test('panel_control: a successful set keeps the change (no restore)', async () => {
  const panels = new Map<string, PanelInfo>();
  panels.set('flower', { id: 'flower', name: 'Flower of Life', open: true, properties: { color: 'green' } });
  const bus: PanelBus = {
    listPanels: () => Array.from(panels.values()),
    getPanel: (id) => {
      const p = panels.get(id);
      return p ? { ...p, properties: { ...p.properties } } : null;
    },
    openPanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = true;
      return true;
    },
    closePanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = false;
      return true;
    },
    focusPanel: () => true,
    setPanelProperty: (id, property, value) => {
      const p = panels.get(id);
      if (!p) return false;
      p.properties[property] = value;
      return true;
    },
  };
  attachPanelBus(bus);
  try {
    const approval = permissionGate.requestTool('panel_control', 'set', 'test: set flower color to red');
    permissionGate.approve(approval.id);
    const result = (await toolRegistry.execute(
      'panel_control',
      { action: 'set', panelId: 'flower', property: 'color', value: 'red' },
      { approvalId: approval.id },
    )) as { available: boolean; ok: boolean; restored?: boolean };
    assert.equal(result.ok, true);
    assert.equal(result.restored, undefined, 'a success must not report a restore');
    assert.equal(panels.get('flower')!.properties.color, 'red');
  } finally {
    attachPanelBus(null);
  }
});

test('panel_control: restorePanelSnapshot replays open + properties', () => {
  const panels = new Map<string, PanelInfo>();
  panels.set('flower', { id: 'flower', name: 'Flower of Life', open: false, properties: { color: 'blue' } });
  const bus: PanelBus = {
    listPanels: () => Array.from(panels.values()),
    getPanel: (id) => {
      const p = panels.get(id);
      return p ? { ...p, properties: { ...p.properties } } : null;
    },
    openPanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = true;
      return true;
    },
    closePanel: (id) => {
      const p = panels.get(id);
      if (!p) return false;
      p.open = false;
      return true;
    },
    focusPanel: () => true,
    setPanelProperty: (id, property, value) => {
      const p = panels.get(id);
      if (!p) return false;
      p.properties[property] = value;
      return true;
    },
  };
  const snapshot: PanelInfo = { id: 'flower', name: 'Flower of Life', open: true, properties: { color: 'green', size: 2 } };
  const ok = restorePanelSnapshot(bus, snapshot);
  assert.equal(ok, true);
  assert.equal(panels.get('flower')!.open, true);
  assert.equal(panels.get('flower')!.properties.color, 'green');
  assert.equal(panels.get('flower')!.properties.size, 2);
});
