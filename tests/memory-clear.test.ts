/**
 * NVK Agent — clear-all tests (v0.1.8, 2026-11-22).
 *
 * Run: npm test
 *
 * Confirmed root cause (nav-UX diagnosis G1): Settings → "Clear all
 * local data" called window.confirm, then memoryStore.clearAll() —
 * but clearAll() only emptied the in-memory map, the IndexedDB store
 * and localStorage. The model weights live in the Cache API store
 * 'transformers-cache' (see inference.ts isModelWeightsCached), which
 * clearAll() never touched — so ~466.8 MB of weights survived the
 * clear and the storage reading never dropped.
 *
 * These tests prove clearAll() now deletes the app's own model cache
 * (and only that cache), and still works when the Cache API is absent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryStore } from '../src/intelligence/memory';

test('clearAll: deletes the transformers-cache model weights', async () => {
  const deleted: string[] = [];
  const fakeCaches = {
    async delete(name: string): Promise<boolean> {
      deleted.push(name);
      return true;
    },
  };
  (globalThis as unknown as { caches: unknown }).caches = fakeCaches;

  await memoryStore.set('probe', 'value');
  assert.equal(await memoryStore.get('probe'), 'value');
  await memoryStore.clearAll();
  assert.equal(await memoryStore.get('probe'), null, 'stored data must be gone');
  assert.deepEqual(deleted, ['transformers-cache'], 'clearAll must delete the model cache');
});

test('clearAll: works when the Cache API is absent', async () => {
  delete (globalThis as unknown as { caches?: unknown }).caches;
  await memoryStore.set('probe2', 'value');
  await memoryStore.clearAll();
  assert.equal(await memoryStore.get('probe2'), null);
});

test('clearAll: returns true when the store verifies empty', async () => {
  // 2026-11-23: clearAll() now verifies through the same read path the
  // chat UI uses and reports false when data survived, instead of
  // returning void and leaving the caller to assume success.
  await memoryStore.set('probe3', 'value');
  assert.equal(await memoryStore.clearAll(), true);
  assert.equal(await memoryStore.get('probe3'), null);
});

test('clearAll: sweeps localStorage keys with the nvk-agent: prefix', async () => {
  // Install a minimal localStorage fake (Node has none). Stored keys are
  // mirrored as own enumerable properties so Object.keys() sees them,
  // exactly as clearAll() enumerates them in the browser.
  const data = new Map<string, string>([
    ['nvk-agent:conversation', JSON.stringify([{ role: 'user', text: 'hi', at: 1 }])],
    ['nvk-agent:settings', JSON.stringify({})],
    ['unrelated-key', 'keep me'],
  ]);
  const fake: Record<string, unknown> = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
      fake[k] = v;
    },
    removeItem: (k: string) => {
      data.delete(k);
      delete fake[k];
    },
  };
  for (const k of data.keys()) fake[k] = data.get(k);
  const holder = globalThis as { localStorage?: unknown };
  const prev = holder.localStorage;
  holder.localStorage = fake;
  try {
    const stored = await memoryStore.get<{ role: string; text: string; at: number }[]>(
      'conversation',
    );
    assert.equal(stored?.[0]?.text, 'hi');
    assert.equal(await memoryStore.clearAll(), true);
    assert.equal(data.has('nvk-agent:conversation'), false);
    assert.equal(data.has('nvk-agent:settings'), false);
    assert.equal(data.get('unrelated-key'), 'keep me');
    assert.equal(await memoryStore.get('conversation'), null);
  } finally {
    if (prev === undefined) delete holder.localStorage;
    else holder.localStorage = prev;
  }
});
