/**
 * NVK Agent — connector tool tests (Sprint 6, first real connectors).
 *
 * web_fetch + web_search call the gateway (the CODEXA Cloudflare
 * Worker) — never a provider directly. The tests stub the global
 * fetch so no network is needed: a gateway success returns the real
 * payload, a gateway failure (or a network error) returns an honest
 * unavailable, never a fabricated page or result.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { toolRegistry } from '../src/intelligence/tools';

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

test('web_fetch: a gateway success returns the fetched text', async () => {
  const restore = stubFetch(async (url) => {
    assert.ok(url.startsWith('https://codexa.nvkglobal.workers.dev/fetch'), `must call the gateway, got ${url}`);
    return jsonResponse({ url: 'https://example.com', status: 200, contentType: 'text/html', text: '<html>hello</html>', truncated: false, chars: 18 });
  });
  try {
    const result = (await toolRegistry.execute('web_fetch', { url: 'https://example.com' })) as {
      available: boolean;
      text: string;
      status: number;
      truncated: boolean;
    };
    assert.equal(result.available, true);
    assert.equal(result.text, '<html>hello</html>');
    assert.equal(result.status, 200);
    assert.equal(result.truncated, false);
  } finally {
    restore();
  }
});

test('web_fetch: a gateway failure returns an honest unavailable (never a fabricated page)', async () => {
  const restore = stubFetch(async () => {
    throw new Error('network down');
  });
  try {
    const result = (await toolRegistry.execute('web_fetch', { url: 'https://example.com' })) as {
      available: boolean;
      reason: string;
    };
    assert.equal(result.available, false);
    assert.ok(result.reason.length > 0);
  } finally {
    restore();
  }
});

test('web_fetch: a missing url is refused, never fetched', async () => {
  const result = (await toolRegistry.execute('web_fetch', {})) as { available: boolean; reason: string };
  assert.equal(result.available, false);
  assert.ok(result.reason.includes('url'));
});

test('web_search: a gateway success returns real results', async () => {
  const restore = stubFetch(async (url) => {
    assert.ok(url.startsWith('https://codexa.nvkglobal.workers.dev/search?q='), `must call the gateway, got ${url}`);
    return jsonResponse({
      query: 'NVK smartwatch',
      results: [{ title: 'NVK TIME MACHINE', url: 'https://example.com/nvk', snippet: 'A smartwatch.' }],
      count: 1,
    });
  });
  try {
    const result = (await toolRegistry.execute('web_search', { query: 'NVK smartwatch' })) as {
      available: boolean;
      results: { title: string; url: string }[];
      count: number;
    };
    assert.equal(result.available, true);
    assert.equal(result.count, 1);
    assert.equal(result.results[0].title, 'NVK TIME MACHINE');
  } finally {
    restore();
  }
});

test('web_search: a gateway failure returns an honest unavailable (never invented results)', async () => {
  const restore = stubFetch(async () => jsonResponse({ error: 'search_failed' }, false));
  try {
    const result = (await toolRegistry.execute('web_search', { query: 'NVK' })) as {
      available: boolean;
      reason: string;
    };
    assert.equal(result.available, false);
    assert.ok(result.reason.length > 0);
  } finally {
    restore();
  }
});

test('web_search: an empty results list is a real empty (not an error)', async () => {
  const restore = stubFetch(async () => jsonResponse({ query: 'zzzzzqqqqq', results: [], count: 0 }));
  try {
    const result = (await toolRegistry.execute('web_search', { query: 'zzzzzqqqqq' })) as {
      available: boolean;
      results: unknown[];
      count: number;
    };
    assert.equal(result.available, true);
    assert.equal(result.count, 0);
    assert.deepEqual(result.results, []);
  } finally {
    restore();
  }
});
