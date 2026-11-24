// NVK Agent — tests for the free cloud gateway route (the brain lesson,
// 2026-11-23). Run: npx tsx --test tests/router-gateway.test.ts
// The gateway is the shared NVK brain endpoint (Kilo free tier, keyless).
// decideRoute is pure logic; generateViaGateway is tested with a stubbed
// fetch so no live network call is made here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute, generateViaGateway, NVK_GATEWAY_BASE } from '../src/intelligence/router';
import { settingsStore } from '../src/intelligence/settings';
import { localInferenceEngine } from '../src/intelligence/inference';

test('the gateway base is the shared NVK brain endpoint', () => {
  assert.equal(NVK_GATEWAY_BASE, 'https://codexa.nvkglobal.workers.dev');
});

test('decideRoute returns cloud-gateway when no model is loaded, no provider key, and the free gateway is on', () => {
  assert.equal(localInferenceEngine.isReady(), false);
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: true });
  const decision = decideRoute();
  assert.equal(decision.route, 'cloud-gateway');
  assert.match(decision.reason, /free cloud gateway/i);
});

test('decideRoute returns local (demo) when the free gateway is off and no provider key is set', () => {
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const decision = decideRoute();
  assert.equal(decision.route, 'local');
  assert.match(decision.reason, /Demo mode/i);
  // Restore the default for the other tests.
  settingsStore.update({ freeCloudEnabled: true });
});

test('decideRoute prefers the owner’s own provider key over the free gateway', () => {
  settingsStore.update({ cloudEnabled: true, providerKey: 'test-key', cloudProvider: 'openai', freeCloudEnabled: true });
  const decision = decideRoute();
  assert.equal(decision.route, 'cloud-openai');
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null });
});

test('generateViaGateway returns the gateway text and tier on a 200', async () => {
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    assert.equal(url, `${NVK_GATEWAY_BASE}/ai/generate`);
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.messages[0].content, 'What is 2+2?');
    return new Response(JSON.stringify({ tier: 'kilo', model: 'kilo-auto/free', text: '4', notice: 'Workers AI unavailable, using Kilo free.' }), { status: 200 });
  };
  try {
    const result = await generateViaGateway('What is 2+2?');
    assert.ok(result);
    assert.equal(result.text, '4');
    assert.equal(result.tier, 'kilo');
    assert.equal(result.model, 'kilo-auto/free');
    assert.match(result.notice ?? '', /Kilo/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('generateViaGateway returns null on a 429 (all tiers exhausted) — the caller falls through to demo mode, never a fake answer', async () => {
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: 'all_cloud_tiers_exhausted' }), { status: 429 });
  try {
    const result = await generateViaGateway('What is 2+2?');
    assert.equal(result, null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('generateViaGateway returns null on a network failure and on an empty text', async () => {
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => { throw new Error('network down'); };
  try {
    assert.equal(await generateViaGateway('hi'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ tier: 'kilo', text: '' }), { status: 200 });
  try {
    assert.equal(await generateViaGateway('hi'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});
