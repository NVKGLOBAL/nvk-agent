# NVK Agent — Clear-data failure: diagnosis + fix log

**Date:** 2026-11-23 (late PT). **Working copy:** `~/workspace/nvk-agent-build/`.
**Live site at diagnosis time:** https://nvkglobal.github.io/nvk-agent/ (bundle
`index-BQ-sbTTg.js`, main `381e7ce2`) — the fix below is **local only: NOT pushed,
NOT deployed**. Live retest of the fix is still owed.

## What the live retest found (2026-11-23 ~23:42–23:49 PT)

- Chat 2+2 via free Kilo gateway: PASS. Status card naming Kilo: PASS.
  Settings gateway toggle checked: PASS.
- Clear-data: FAIL. "Clear all local data" clicked 3× (twice plain, once with
  Enter for any confirmation). No confirmation dialog appeared. After reload:
  all 14 prior exchanges still present, Diagnostics still "Local storage:
  PASS — 6.9 MB used" (unchanged), Kilo toggle still checked.
- Odd nuance: the fresh "Four" exchange from that test did NOT survive reload,
  while the older history did.

## Root causes (all in the working copy, verified by reading the code)

### 1. PRIMARY — `window.confirm()` gates the clear, and it never fires (SettingsPanel.tsx:26, old code)

`resetAll()` began with `if (!window.confirm(...)) return;`. Native
`confirm()` dialogs are auto-dismissed (return `false`) by headless/automation
browsers and are suppressible in mobile Safari. The retest browser dismissed
it, so `resetAll()` early-returned on every click: `clearAll()` never ran, no
"Local data cleared." note ever appeared, nothing was cleared. This single
defect explains every retest observation except the fresh-exchange nuance.

### 2. Settings were never actually reset, even on a successful clear (settings.ts, old `resetAll`)

`resetAll()` called `update({ cloudEnabled: false, providerKey: null,
persistKey: false })` after `clearAll()`. Two defects:
- `update()` merges a partial patch, so `freeCloudEnabled`, `activeModelId`
  and `downloadConsentGiven` always survived a clear.
- `update()` immediately re-writes the settings key (`nvk-agent:settings`) to
  localStorage — the same key `clearAll()` had just deleted. Settings were
  re-persisted in the same tick as the clear. The Kilo toggle staying checked
  after reload was guaranteed by this code. (Note: the factory default has
  the gateway ON, so a *true* reset also leaves the toggle checked — that is
  the default, not leftover data. The new confirmation note says so.)

### 3. Run traces resurrect after a clear (runTrace.ts)

Run traces live outside the memory store: localStorage key
`nvk-agent:run-traces` plus an in-memory list in the `runTraceStore`
singleton. `clearAll()`'s localStorage sweep removes the key, but the
in-memory list survives and the next `record()` re-saves it. Traces were
never cleared in `resetAll()`.

### 4. IDB / localStorage divergence — why the fresh exchange vanished (memory.ts, old `get`/`set`)

- `set()` wrote IndexedDB and returned on success, **never touching
  localStorage**; `get()` reads IndexedDB first and only falls back to
  localStorage. The two durable copies could silently diverge, with the older
  copy shadowing the newer one.
- Every storage failure is swallowed (`catch { /* ignore */ }`), so a failed
  write is invisible.
- `openDb()` cached a rejected `dbPromise` forever: one failed open poisoned
  every later get/set/clear in that page lifetime.
- `clearAll()`'s IndexedDB clear went through that same cached promise, so a
  poisoned open meant the IDB clear silently never ran while the localStorage
  sweep did run — exactly the split (fresh copy gone, old copy kept) the
  retest saw: the fresh exchange had landed in the fallback copy only, the
  older history sat in IndexedDB, and after reload `get()` preferred the
  surviving IndexedDB copy. The exact transient that first broke the IDB
  write in that browser session is not determinable from static code; the
  structural hole (single-store writes + silent failures + cached rejection)
  is fixed below so the divergence cannot recur.

### 5. Diagnostics wording (diagnostics.ts:60, old code)

The "Local model loaded" FAIL detail always said "Chat is in demo mode"
whenever no local model was loaded — wrong since the free cloud gateway:
with the gateway on, the chat answers through Kilo and is NOT in demo mode
(same definition as `Chat.tsx` `demoMode`). The check result stays FAIL (no
local model IS loaded); only the "demo mode" claim was wrong.

### Not a cause

- `memoryStore.clearAll()` itself (v0.1.8) DOES delete the Cache API
  `transformers-cache` — verified present in both `src/intelligence/memory.ts`
  and the live bundle `dist/assets/index-BQ-sbTTg.js`. The 466.8 MB defect is
  fixed; this failure was the confirm gate + settings re-persist, not the
  cache delete.
- `runPipeline` DOES append turns on the gateway route (single return at
  pipeline.ts:736; `appendTurn` user + agent at ~708 always runs). The fresh
  exchange was stored; it was the read/write divergence that lost it.
- Chat unmounts when Settings opens (App.tsx conditional render), so no stale
  React state survives a panel switch — the thread re-reads storage on
  remount. No Chat-state fix was needed.

## Fix applied (local only, no push, no deploy)

- `src/experience/chat/SettingsPanel.tsx` — replaced `window.confirm()` with
  an in-app two-step confirm (first click arms, 10 s window, second click
  clears; button label changes to "Click again to confirm clear"). The clear
  now runs `clearAll()` → `runTraceStore.clear()` → `unload()` →
  `settingsStore.reset()`, and shows a verified note (or an honest
  "did not verify empty" warning). Zero `window.confirm` remains in `src/`.
- `src/intelligence/settings.ts` — new `settingsStore.reset()` restoring
  factory defaults and persisting them.
- `src/intelligence/memory.ts`
  - `openDb()`: a failed open drops the cached (rejected) promise so the next
    call retries.
  - `set()`: write-through mirror to localStorage after a successful IndexedDB
    put (best-effort), so the two copies can no longer diverge.
  - `clearAll()`: now returns `Promise<boolean>`; also issues
    `indexedDB.deleteDatabase('nvk-agent-memory')` (fire-and-forget, never
    hangs the clear) and verifies by reading the conversation back through
    the UI's own read path — `true` only when it is actually gone.
- `src/intelligence/diagnostics.ts` — new pure `localModelDetail(status,
  demoMode)`; the "Local model loaded" FAIL detail now says "Chat is
  answering through the free cloud gateway (Kilo) — not demo mode." when the
  gateway is on, "Chat is in demo mode." only when nothing can answer.

## Tests

- Baseline 179 → **184 pass, 0 fail** (`npm test`, tsx).
- New: `tests/memory-clear.test.ts` (+2: clearAll returns true when verified
  empty; clearAll sweeps `nvk-agent:*` localStorage keys via a fake
  localStorage, leaving unrelated keys alone), `tests/settings-reset.test.ts`
  (+1: reset restores every factory default incl. `freeCloudEnabled: true`),
  `tests/diagnostics-wording.test.ts` (+2: demo-mode wording only when
  nothing can answer; gateway wording never claims demo mode). Both new files
  added to the `test` script in `package.json`.
- `npx tsc --noEmit`: clean. `npm run build`: passes (local dist bundle
  `index-CyPLlLPw.js` contains "Click again to confirm clear", zero
  `window.confirm`).

## Still needs a live-browser retest (after deploy)

1. Settings → "Clear all local data": first click arms (note appears, button
   relabels), second click clears; note reads "Local data cleared…".
2. Reload: chat thread empty (0 exchanges), Diagnostics "Local storage" well
   under 6.9 MB, Evidence empty, run traces empty.
3. Kilo toggle still checked after the clear — EXPECTED (factory default is
   ON); the note explains this. Do not file it as a failure.
4. Fresh exchange then reload: the new exchange MUST survive (write-through
   mirror). If it still vanishes, the IDB failure transient needs a live
   console/storage inspection — the unit tests cannot fake IndexedDB.
5. Diagnostics with gateway on, no local model: "Local model loaded: FAIL —
   No model loaded (state: idle). Chat is answering through the free cloud
   gateway (Kilo) — not demo mode."
