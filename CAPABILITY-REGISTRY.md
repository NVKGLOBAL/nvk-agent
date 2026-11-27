# Capability Registry — NVK Agent

Generated from `src/intelligence/capability-registry.ts` (the code is the
source of truth; this file is the human-readable copy). Status meanings are
the Unification Directive §1 classifications.

| Capability | Layer | Status | Evidence / gap |
|---|---|---|---|
| Local inference (Transformers.js, in-browser) | Intelligence | PARTIAL | Engine loads real models from the Hugging Face hub and generates real text. Node validation passed (milestone-10, 2026-11-21), including through the engine path (test:milestone-10-engine). Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): chat answered "The sum of 2 and 2 is equal to four."; Diagnostics 6/6 PASS. PARTIAL until the phone run passes — the iPhone crash at 100% load (2026-11-21) is still unresolved. |
| Milestone-10 validation test (2+2 → 4) | Intelligence | OPERATIONAL | PASSED 2026-11-21 in Node on this VM: Qwen1.5-0.5B-Chat loaded in 6.0s (cached), answered "Two plus two equals four." in 2,976 ms (~1.7 tok/s). Also passed through the engine path the same day (test:milestone-10-engine, browser chat defaults). Full log in docs/MILESTONE-10.md. Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): "The sum of 2 and 2 is equal to four.", Diagnostics 6/6 PASS. |
| Agent pipeline (11 stages) | Intelligence | OPERATIONAL | `src/intelligence/pipeline.ts` implements all 11 stages with real stage events, timing, and evidence records. |
| Capability registry | Intelligence | OPERATIONAL | Registry loads; tests assert no OPERATIONAL entry lacks evidence. |
| Permission gate | Intelligence | OPERATIONAL | `src/intelligence/permissions.ts` denies financial / payment / publishing / destructive / external-account actions unless the owner approves them in the session. |
| Local-first memory | Intelligence | OPERATIONAL | `src/intelligence/memory.ts` persists to IndexedDB with a localStorage fallback; nothing leaves the device. |
| Diagnostics | Intelligence | OPERATIONAL | `src/intelligence/diagnostics.ts` measures model state, adapter, counted outbound requests, and storage. It can report FAIL. Live 2026-11-27 (v0.1.9): Diagnostics overall FAIL — no local model loaded, chat answering via the free cloud gateway, not demo mode. |
| System Settings | Experience | OPERATIONAL | `src/intelligence/settings.ts`: provider cloud OFF by default (cloudEnabled: false); free cloud gateway ON by default (freeCloudEnabled: true); provider keys session-only by default; model management present. |
| Agent spawn | Intelligence | OPERATIONAL | `src/intelligence/agents.ts`: spawn registers the agent, runs it through the pipeline, records the result and evidence. Built, not a form. |
| Nexus orb | Experience | OPERATIONAL | Renderer swapped in v0.1.6 (Phase B): NVK-AI-OS CodexOrbSystem port (NVKGLOBAL/NVK-AI-OS @ b723bc4d9), 11 orb modes defined, 1 wired as the verified default (HolographicCore/Galaxy); OrbHost wires a selector over all 11 modes (2026-11-27), non-default modes not live-verified. Orb states are driven only by real pipeline state. Live 2026-11-27 (phone, 640×1308): orb renders — sphere + 4 node orbs + particles; the "Select a system node" title overlapped the orb top on the 340px phone canvas, so it is hidden below 700px width (DOM node buttons still name the nodes on phones). |
| Resonance visualizer | Experience | OPERATIONAL | Vendored from `NVKGLOBAL/-CODEXA` `components/ResonanceVisualizerPanel.tsx`. Renders real particle bursts per generation event. |
| Knowledge graph | Experience | OPERATIONAL | Vendored from `NVKGLOBAL/-CODEXA` `components/EmergentLogicWeb.tsx`. Force-directed 3D graph, data-driven. |
| Free cloud gateway (Kilo, keyless) | Intelligence | OPERATIONAL | Live 2026-11-27 (v0.1.9, phone + desktop): chat answered "Four" to 2+2 via the Kilo gateway (codexa.nvkglobal.workers.dev/ai/generate) with an evidence ID; composer works after the answer. Unit-tested in tests/router-gateway.test.ts (stubbed fetch: 200 returns text+tier, 429 and network failure return null and fall through to demo mode, never a fake answer). |
| Web search (via the gateway) | Intelligence | OPERATIONAL | `src/intelligence/tools.ts` web_search calls the gateway (codexa.nvkglobal.workers.dev/search); unit-tested in tests/connectors.test.ts (stubbed fetch: a gateway success returns real results, a gateway failure returns an honest unavailable, never fabricated results). Pipeline plans a web_search node for search intents (tests/pipeline-connectors.test.ts). |
| Web fetch (via the gateway) | Intelligence | OPERATIONAL | `src/intelligence/tools.ts` web_fetch calls the gateway (codexa.nvkglobal.workers.dev/fetch); unit-tested in tests/connectors.test.ts (stubbed fetch: a gateway success returns the fetched text, a gateway failure or a missing URL returns an honest unavailable, never a fabricated page). |
| Voice commands | Intelligence | PARTIAL | `src/intelligence/voice.ts` routes a spoken transcript through the same pipeline as typed chat (same tool contract, permission gate, evidence store); unit-tested in tests/voice.test.ts (2026-11-23). PARTIAL: the command path is tested, but browser SpeechRecognition (listening) and SpeechSynthesis (speaking back) are not live-verified in this app. |
| Phone control (relay) | Intelligence | PARTIAL | `src/intelligence/relayAdapter.ts`: pairing codes, chat/status commands, and approve/reject through the real permission gate; unit-tested in tests/relay-adapter.test.ts (stubbed fetch). PARTIAL: no deployed relay Worker is configured (relayUrl empty by default) — live phone proof needs the Worker deployed and the URL pasted in Settings. |
| Cloud provider — Gemini | Intelligence | MISSING | Removed per owner direction (2026-11-23, no Gemini API in NVK builds): the Gemini branch was deleted from src/intelligence/router.ts, the provider option removed from Settings, and cloudProvider narrowed to OpenAI only. No Gemini code ships. |
| Cloud provider — OpenAI | Intelligence | BLOCKED | No API key configured and cloud is OFF by default. Blocked on owner opt-in + key. |
| Payments / checkout | Sovereign Infrastructure | MISSING | No payment provider is wired. CODEXA pricing is $20/mo after a 1-day trial (live CODEXA, single tier); the checkout is not built. |
| Wallet / chain / explorer | Sovereign Infrastructure | MISSING | No wallet or explorer code exists in any NVK repo (verified in the unification inventory). Not claimed anywhere. |
| Publishing | Sovereign Infrastructure | BLOCKED | No destination is wired and publishing requires explicit owner authorization per action. Blocked on both. |
| Evidence store | Sovereign Infrastructure | OPERATIONAL | `src/sovereign/evidence.ts` records pipeline evidence with content hashes; re-verify recomputes and reports pass/fail. |

## Rules

- Nothing is OPERATIONAL without evidence. A status change requires a passing
  test or a verified run, never a claim.
- SIMULATED entries must not exist in the shipped registry. If something is
  simulated, it is labelled SIMULATED and never presented as working.
- This file is updated only when the code registry changes.
