/**
 * NVK Agent — retest #14 fix tests (2026-11-23).
 *
 * The live retest found the Agent answering identity, status-check and
 * web-search with the demo-mode disclaimer — because (a) a bare "who are
 * you" matched no identity pattern, and (b) the pipeline only ran the
 * DAG when a model was loaded, even though the tools (diagnostics, the
 * gateway) do not need a model. The fix: the identity patterns cover
 * the bare question, and a tool intent's answer is composed from the
 * DAG results, model or no model.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyIntent,
  composeToolAnswer,
  IDENTITY_ANSWER,
  runPipeline,
} from '../src/intelligence/pipeline';
import type { NodeResult } from '../src/intelligence/planDAG';

const DEMO_DISCLAIMER = 'Demo mode — no model is loaded';

test('retest-14: a bare "who are you" is an identity question', () => {
  assert.equal(classifyIntent('who are you'), 'identity');
  assert.equal(classifyIntent('what are you'), 'identity');
  assert.equal(classifyIntent('Who are you?'), 'identity');
});

test('retest-14: "who are you" answers from the fixed rule (no model needed)', async () => {
  const result = await runPipeline('who are you');
  assert.equal(result.answer, IDENTITY_ANSWER);
  assert.ok(!result.answer.includes('Demo mode'), 'the identity answer is not the demo disclaimer');
  assert.equal(result.blocked, false);
});

test('retest-14: composeToolAnswer — a diagnostics report becomes a readable summary', () => {
  const results = [
    {
      node: { id: 'diagnostics', tool: 'diagnostics', args: {}, predicted: {}, dependsOn: [] },
      data: {
        at: 123,
        overall: 'fail',
        checks: [
          { name: 'Local model loaded', result: 'fail', detail: 'No model loaded (state: idle). Chat is in demo mode.' },
          { name: 'Hardware adapter', result: 'pass', detail: 'ONNX runtime: WASM.' },
        ],
      },
      outcome: { matched: true, diff: '' },
      replanned: false,
    } as unknown as NodeResult,
  ];
  const answer = composeToolAnswer('status-check', results);
  assert.ok(answer.includes('overall FAIL'), `the summary names the overall result, got: ${answer}`);
  assert.ok(answer.includes('Local model loaded: FAIL'), 'the summary lists the failing check');
  assert.ok(answer.includes('Hardware adapter: PASS'), 'the summary lists the passing check');
});

test('retest-14: composeToolAnswer — a web search becomes a result list', () => {
  const results = [
    {
      node: { id: 'web-search', tool: 'web_search', args: {}, predicted: {}, dependsOn: [] },
      data: {
        available: true,
        query: 'NVK smartwatch',
        results: [
          { title: 'NVK TIME MACHINE', url: 'https://example.com/nvk', snippet: 'A smartwatch.' },
          { title: 'NVK Global', url: 'https://example.com/global', snippet: 'The store.' },
        ],
        count: 2,
      },
      outcome: { matched: true, diff: '' },
      replanned: false,
    } as unknown as NodeResult,
  ];
  const answer = composeToolAnswer('web-search', results);
  assert.ok(answer.includes('NVK TIME MACHINE — https://example.com/nvk'), 'the list names the first result');
  assert.ok(answer.includes('NVK Global — https://example.com/global'), 'the list names the second result');
});

test('retest-14: composeToolAnswer — an unavailable search is an honest unavailable (never invented)', () => {
  const results = [
    {
      node: { id: 'web-search', tool: 'web_search', args: {}, predicted: {}, dependsOn: [] },
      data: { available: false, reason: 'the search provider could not be reached' },
      outcome: { matched: true, diff: '' },
      replanned: false,
    } as unknown as NodeResult,
  ];
  const answer = composeToolAnswer('web-search', results);
  assert.ok(answer.includes('could not search'), `the answer is honest, got: ${answer}`);
  assert.ok(!answer.includes('NVK TIME MACHINE'), 'no result is invented');
});

test('retest-14: composeToolAnswer — a web fetch returns the fetched text', () => {
  const results = [
    {
      node: { id: 'web-fetch', tool: 'web_fetch', args: {}, predicted: {}, dependsOn: [] },
      data: { available: true, url: 'https://example.com', status: 200, text: 'Hello, world.', truncated: false },
      outcome: { matched: true, diff: '' },
      replanned: false,
    } as unknown as NodeResult,
  ];
  const answer = composeToolAnswer('web-fetch', results);
  assert.ok(answer.includes('https://example.com'), 'the answer names the URL');
  assert.ok(answer.includes('Hello, world.'), 'the answer carries the fetched text');
});

test('retest-14: composeToolAnswer — a tool with no data is an honest no-result (never fabricated)', () => {
  const answer = composeToolAnswer('status-check', []);
  assert.ok(answer.includes('did not return a result'), `the answer is honest, got: ${answer}`);
});

test('retest-14: a web-search intent in demo mode does NOT return the demo disclaimer', async () => {
  // The web_search tool calls the live gateway (the Worker /search
  // endpoint). The gateway returns real results or an honest empty /
  // failure — either way, the answer must come from the tool, not from
  // the demo disclaimer. This test proves the pipeline routes tool
  // intents to the DAG in demo mode.
  const result = await runPipeline('search for NVK smartwatch');
  assert.ok(!result.answer.includes(DEMO_DISCLAIMER), `the answer must not be the demo disclaimer, got: ${result.answer}`);
  assert.ok(result.answer.length > 0, 'there is an answer');
});

test('retest-14: a status-check intent in demo mode does NOT return the demo disclaimer', async () => {
  // In Node the diagnostics tool cannot run (it reads navigator), so the
  // tool fails and the answer is the honest no-result message — but it
  // is NOT the demo disclaimer. In the browser (where navigator exists)
  // the same path returns the real diagnostics summary.
  const result = await runPipeline('what is the status');
  assert.ok(!result.answer.includes(DEMO_DISCLAIMER), `the answer must not be the demo disclaimer, got: ${result.answer}`);
  assert.ok(result.answer.length > 0, 'there is an answer');
});
