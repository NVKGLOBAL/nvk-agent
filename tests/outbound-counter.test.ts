/**
 * NVK Agent — outbound counter tests (2026-11-24 fix).
 *
 * Run: npm test
 *
 * Root causes: (1) the tally was in-memory only, so every page load reset
 * it to 0 — and Diagnostics then claimed "Nothing has left this device",
 * false for the session: the gateway POST had happened before the reload
 * (the clear-data retest reloads the page, which is exactly how the 0 was
 * observed). The tally is now persisted across reloads within one browser
 * session (session id in sessionStorage, tally in localStorage). (2) The
 * Diagnostics panel showed a frozen snapshot from the last button click —
 * it now auto-runs on mount. (3) AgentRelayClient captured fetch at
 * construction, which would bypass the wrapper if constructed before
 * install — it now resolves fetch lazily at call time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { OutboundCounter } from '../src/intelligence/outbound';
import { outboundDetail } from '../src/intelligence/diagnostics';
import { AgentRelayClient } from '../src/intelligence/relayAdapter';

/* A minimal in-memory Storage stand-in. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  } as Storage;
}

interface FakeWindow {
  fetch: typeof fetch;
  location: { origin: string };
  sessionStorage: Storage;
  localStorage: Storage;
}

function makeWindow(): FakeWindow {
  return {
    fetch: (async () => new Response(JSON.stringify({ text: 'Four' }), { status: 200 })) as typeof fetch,
    location: { origin: 'https://nvkglobal.github.io' },
    sessionStorage: fakeStorage(),
    localStorage: fakeStorage(),
  };
}

/** Install a fake browser window on globalThis; returns a restore function. */
function useFakeWindow(win: FakeWindow): () => void {
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = win;
  return () => {
    if (prevWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = prevWindow;
  };
}

test('outbound: wrapper counts a gateway-style POST by host', async () => {
  const win = makeWindow();
  const restore = useFakeWindow(win);
  try {
    const counter = new OutboundCounter();
    counter.install();
    assert.notEqual(win.fetch, counter, 'install must replace window.fetch');
    await win.fetch('https://codexa.nvkglobal.workers.dev/ai/generate', { method: 'POST' });
    await win.fetch('https://codexa.nvkglobal.workers.dev/ai/generate', { method: 'POST' });
    await win.fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
    const tally = counter.get();
    assert.equal(tally.total, 3);
    assert.equal(tally.byHost['codexa.nvkglobal.workers.dev'], 2);
    assert.equal(tally.byHost['api.openai.com'], 1);
  } finally {
    restore();
  }
});

test('outbound: tally survives a simulated page reload in the same session', async () => {
  const win = makeWindow();
  const restore = useFakeWindow(win);
  try {
    const originalFetch = win.fetch;
    const before = new OutboundCounter();
    before.install();
    await win.fetch('https://codexa.nvkglobal.workers.dev/ai/generate', { method: 'POST' });
    assert.equal(before.get().total, 1);
    // A reload is a fresh JS context: fresh counter, fresh wrapper on the
    // original fetch, same sessionStorage/localStorage.
    win.fetch = originalFetch;
    const after = new OutboundCounter();
    after.install();
    assert.equal(after.get().total, 1, 'the pre-reload gateway request must still be counted');
    assert.equal(after.get().byHost['codexa.nvkglobal.workers.dev'], 1);
    await win.fetch('https://codexa.nvkglobal.workers.dev/fetch', { method: 'POST' });
    assert.equal(after.get().total, 2, 'counting continues from the restored tally');
  } finally {
    restore();
  }
});

test('outbound: a new browser session starts at zero', async () => {
  const win = makeWindow();
  const restore = useFakeWindow(win);
  try {
    const first = new OutboundCounter();
    first.install();
    await win.fetch('https://codexa.nvkglobal.workers.dev/ai/generate', { method: 'POST' });
    assert.equal(first.get().total, 1);
    // New tab = new sessionStorage (new session id), same localStorage.
    win.sessionStorage = fakeStorage();
    win.fetch = makeWindow().fetch;
    const second = new OutboundCounter();
    second.install();
    assert.equal(second.get().total, 0, 'a new session must not inherit the old tally');
  } finally {
    restore();
  }
});

test('outbound: reset clears the persisted tally too', async () => {
  const win = makeWindow();
  const restore = useFakeWindow(win);
  try {
    const originalFetch = win.fetch;
    const counter = new OutboundCounter();
    counter.install();
    await win.fetch('https://codexa.nvkglobal.workers.dev/ai/generate', { method: 'POST' });
    assert.equal(counter.get().total, 1);
    counter.reset();
    assert.equal(counter.get().total, 0);
    // A reload after the reset must still read 0 (clear-data contract).
    win.fetch = originalFetch;
    const after = new OutboundCounter();
    after.install();
    assert.equal(after.get().total, 0);
  } finally {
    restore();
  }
});

test('outbound: zero never claims nothing left the device', () => {
  const detail = outboundDetail({ total: 0, byHost: {} });
  assert.match(detail, /0 requests counted this session/);
  assert.ok(
    !detail.includes('Nothing has left this device'),
    'zero must say "none counted", never "nothing left the device"',
  );
});

test('outbound: a counted request lists its host', () => {
  const detail = outboundDetail({
    total: 2,
    byHost: { 'codexa.nvkglobal.workers.dev': 2 },
  });
  assert.match(detail, /2 requests/);
  assert.match(detail, /codexa\.nvkglobal\.workers\.dev \(2\)/);
});

test('relay: client resolves fetch lazily, so traffic is counted even when constructed before the wrap', async () => {
  const calls: string[] = [];
  const stubFetch = (async (url: string) => {
    calls.push(url);
    return { json: async () => ({ ok: true }) };
  }) as unknown as typeof fetch;
  const prevFetch = (globalThis as any).fetch;
  const client = new AgentRelayClient({
    relayUrl: 'https://relay.example.workers.dev',
    desktopId: 'nvk-agent',
    desktopToken: 'test-token',
  });
  // The fetch the client will use is installed AFTER construction —
  // the old constructor captured the pre-wrap fetch here.
  (globalThis as any).fetch = stubFetch;
  try {
    await client.registerPairing('123456');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/desktop\/register-pairing/);
  } finally {
    (globalThis as any).fetch = prevFetch;
  }
});
