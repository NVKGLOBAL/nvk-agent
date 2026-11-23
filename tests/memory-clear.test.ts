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
