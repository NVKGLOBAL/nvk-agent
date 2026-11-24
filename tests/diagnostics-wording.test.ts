/**
 * NVK Agent — diagnostics wording tests (2026-11-23, clear-data fix).
 *
 * Run: npm test
 *
 * Root cause: the "Local model loaded" check always said "Chat is in demo
 * mode" whenever no local model was loaded — wrong since the free cloud
 * gateway: with the gateway on, the chat answers through Kilo and is NOT
 * in demo mode (same definition as Chat.tsx demoMode). The check result
 * stays FAIL (no local model IS loaded); only the "demo mode" claim is
 * corrected.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { localModelDetail } from '../src/intelligence/diagnostics';

test('diagnostics: demo-mode wording only when nothing can answer', () => {
  const demo = localModelDetail('idle', true);
  assert.match(demo, /Chat is in demo mode/);
});

test('diagnostics: gateway answering is not demo mode', () => {
  const gateway = localModelDetail('idle', false);
  assert.match(gateway, /free cloud gateway \(Kilo\)/);
  assert.ok(
    !gateway.includes('Chat is in demo mode'),
    'must not claim demo mode when the gateway is answering',
  );
});
