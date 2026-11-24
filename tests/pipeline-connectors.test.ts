/**
 * NVK Agent — pipeline connector planning tests (Sprint 6).
 *
 * A search request plans a web_search node; a fetch request (with a
 * URL) plans a web_fetch node. Both go through the gateway — the tools
 * are real, so the plan is real. An intent with no tool work yields an
 * EMPTY plan (never a fabricated plan).
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent } from '../src/intelligence/pipeline';

test('pipeline: a search request classifies as web-search', () => {
  assert.equal(classifyIntent('search for NVK smartwatch'), 'web-search');
  assert.equal(classifyIntent('search the web for NVK'), 'web-search');
  assert.equal(classifyIntent('look up the NVK store'), 'web-search');
  assert.equal(classifyIntent('find out what NVK Global does'), 'web-search');
});

test('pipeline: a fetch request with a URL classifies as web-fetch', () => {
  assert.equal(classifyIntent('fetch https://example.com'), 'web-fetch');
  assert.equal(classifyIntent('please fetch https://nvk.global for me'), 'web-fetch');
});

test('pipeline: a plain question is still open-question (no tool plan)', () => {
  assert.equal(classifyIntent('what is the weather like?'), 'open-question');
  assert.equal(classifyIntent('tell me a story'), 'open-question');
});
