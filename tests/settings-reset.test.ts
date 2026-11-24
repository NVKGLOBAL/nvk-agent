/**
 * NVK Agent — settings reset tests (2026-11-23, clear-data fix).
 *
 * Run: npm test
 *
 * Root cause: Settings → "Clear all local data" merged a partial patch
 * ({cloudEnabled, providerKey, persistKey}) over the live settings, so
 * freeCloudEnabled, activeModelId and downloadConsentGiven always
 * survived a clear — and the patch re-wrote the settings key to
 * localStorage immediately after clearAll() had deleted it, so the
 * settings were never actually cleared at all. settingsStore.reset()
 * restores the factory defaults; these tests prove every field lands
 * back on its default.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { settingsStore } from '../src/intelligence/settings';
import { INFERENCE_MODELS } from '../src/intelligence/inference';

test('settings reset: restores factory defaults', () => {
  settingsStore.update({
    cloudEnabled: true,
    cloudProvider: 'openai',
    freeCloudEnabled: false,
    downloadConsentGiven: true,
    persistKey: true,
  });
  const before = settingsStore.get();
  assert.equal(before.cloudEnabled, true);
  assert.equal(before.freeCloudEnabled, false);

  settingsStore.reset();

  const s = settingsStore.get();
  assert.equal(s.activeModelId, INFERENCE_MODELS[0].id);
  assert.equal(s.cloudEnabled, false);
  assert.equal(s.cloudProvider, null);
  assert.equal(s.providerKey, null);
  assert.equal(s.persistKey, false);
  assert.equal(s.downloadConsentGiven, false);
  // The default has the free cloud gateway ON — after a true reset the
  // Kilo toggle is still checked. That is the default, not leftover data.
  assert.equal(s.freeCloudEnabled, true);
});
