# NVK Agent — Apply-Everything-Learned Round (gateway + auto-load) — 2026-11-23

## What this is

NvK (2026-11-23 ~23:32 PT): "take everything you have learned and apply
it to the NVK AGENT build as well." The lessons applied here are the ones
proven on CODEXA + the OS the same night:

1. **The brain (CODEXA router widening):** a strong model answers 2+2
   through the Kilo free tier. The Agent had no such path — its chat was
   demo mode until a 350 MB model downloaded, and its only cloud route
   needed the owner's own Gemini/OpenAI key.
2. **The activation handoff (CODEXA):** auto-load an installed model from
   cache on mount, so a returning device opens into a working agent.
3. **The clear-data defect:** the v0.1.8 fix (delete the Cache API
   'transformers-cache' store) was already in the working copy — it is
   verified as present here, not rebuilt.

## Changes

### 1. Free cloud gateway route (the brain)

- `src/intelligence/settings.ts`: NEW `freeCloudEnabled: boolean`,
  default `true`. ON by default — NvK wants the AI unlimited (2026-11-23)
  and approved the same Kilo tier in CODEXA's default chain. The user can
  turn it off in Settings for local-only.
- `src/intelligence/router.ts`:
  - NEW `NVK_GATEWAY_BASE = 'https://codexa.nvkglobal.workers.dev'`
    (the shared NVK brain endpoint).
  - NEW route `'cloud-gateway'`; `decideRoute()` now returns it when the
    local model is not loaded, no provider key is configured, and the
    free gateway is on. The owner's own provider key still wins over the
    gateway; a loaded local model still wins over everything.
  - NEW `generateViaGateway(prompt, maxNewTokens)` — POSTs to the gateway
    `/ai/generate`, returns `{text, tier, model, notice}` or `null` when
    the gateway cannot serve it (429, network failure, non-JSON, empty
    text). Null falls through to demo mode honestly, never a fake answer.
    The gateway's CORS is `*`, so this works cross-origin from the
    Agent's GitHub Pages origin. No key is needed or sent.
  - The router header comment is updated: the gateway is the one cloud
    path that IS a fallback by design (per NvK's unlimited direction);
    the owner's own keyed providers remain explicit-opt-in only, and a
    local failure is still reported, not papered over.
- `src/intelligence/pipeline.ts`: the reasoning stage gains a
  `decision.route === 'cloud-gateway'` branch — on a gateway result the
  answer is the gateway text with `modelId = 'cloud:gateway:<tier>'`
  and the tier/notice in the stage event; on null it falls through to
  the honest demo-mode answer.

### 2. Auto-load from cache (the activation handoff)

- `src/experience/chat/Chat.tsx`: on mount, when the engine is not ready
  and `isModelWeightsCached(settings.activeModelId)` is true, the model
  loads automatically — no download, no consent needed, the weights are
  already on the device. When nothing is cached, the download stays
  user-initiated (the 350 MB pull needs the owner's consent). This is
  what makes a returning device open straight into a working agent
  instead of demo mode.
- The status card gains a gateway line: when the local model is not
  loaded but the free gateway is on, it says "Free cloud gateway: Kilo
  (keyless) via the shared NVK brain endpoint" instead of the demo-mode
  message. `demoMode` is now false when the gateway is on (the chat
  answers through it — it is not demo mode).

### 3. Settings toggle

- `src/experience/chat/SettingsPanel.tsx`: a "Free cloud gateway (Kilo,
  keyless)" checkbox in the Cloud section, with a plain-language note
  that requests leave the device. The old "Cloud is off by default"
  paragraph is reworded to cover only the owner's own provider key.
- `resetAll` needs no change: `clearAll()` already deletes the settings
  key (`nvk-agent:settings`, under the `nvk-agent:` prefix), so a full
  reset restores the default (`freeCloudEnabled: true`).

### 4. Clear-data — verified present, not rebuilt

- `src/intelligence/memory.ts` `clearAll()` already deletes the Cache
  API store `'transformers-cache'` (the v0.1.8 fix) — the exact defect
  retest #4 found (466.8 MB left behind). It was in the working copy
  before this round. The live retest below must verify it actually
  clears on the live site.

## Tests

- NEW `tests/router-gateway.test.ts` (7 tests): the gateway base URL; 
  `decideRoute` returns `cloud-gateway` with no model / no key / gateway
  on; `decideRoute` returns `local` (demo) with the gateway off; the
  owner's own key wins over the gateway; `generateViaGateway` returns
  text + tier + notice on a 200 (stubbed fetch); null on a 429; null on
  a network failure and on empty text.
- The 5 existing tests that assert demo-mode behaviour now establish the
  demo-mode precondition explicitly (`freeCloudEnabled: false`, no key)
  before running the pipeline — the gateway is ON by default in the
  browser, so without this they would answer via the live gateway
  instead of demo mode. Files: capability-registry, generation-events,
  metacognition, orb-state-discipline (2 tests). The import for one file
  (capability-registry) was initially inserted inside a multi-line import
  and split it; fixed by moving it after the import block.
- Full suite: **179/179 pass** (was 172, +7 gateway tests). tsc clean.
  Build passes (new bundle `index-BQ-sbTTg.js`).

## What is NOT in this round

- **Relay UI wiring** (desktop token field, pairing-code display,
  start/stop): the adapter exists but is not wired into the App UI.
  It stays unwired until the relay Worker is deployed — the Worker
  deploy is blocked on NvK's Cloudflare access, and the UI without a
  deployed Worker is useless. Sprint 8 slice 5 remains blocked.
- **Node-label occlusion / flare:** parked per NvK's "Leave it for now"
  (2026-11-22). Not touched.
- **Phone layout / iPhone crash:** unverified; the iPhone crash at 100%
  load is unresolved (leading hypothesis: iOS jetsam on the 350 MB
  model; the WASM thread cap is a mitigation, not a guarantee). The
  gateway route is the practical answer for the phone: the Agent
  answers correctly with no model download at all.

## Next: deploy + live retest

Push main + gh-pages (approval cards), verify the live bundle, then a
live retest: (1) chat "What is 2+2?" with NO model loaded — the gateway
must answer "4" (not demo mode); (2) the status card must name the free
cloud gateway; (3) Settings must show the gateway toggle; (4) clear-data
must actually clear (the 466.8 MB defect — verify storage drops).
