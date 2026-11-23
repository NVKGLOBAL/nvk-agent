# Capability Registry — NVK Agent

Generated from `src/intelligence/capability-registry.ts` (the code is the
source of truth; this file is the human-readable copy). Status meanings are
the Unification Directive §1 classifications.

| Capability | Layer | Status | Evidence / gap |
|---|---|---|---|
| Local inference (Transformers.js, in-browser) | Intelligence | PARTIAL | Engine loads real models and generates real text. Node validation passed (milestone-10, 2026-11-21), including through the engine path (test:milestone-10-engine). Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): chat answered "The sum of 2 and 2 is equal to four."; Diagnostics 6/6 PASS. PARTIAL until the phone run passes — the iPhone crash at 100% load (2026-11-21) is still unresolved. |
| Milestone-10 validation test (2+2 → 4) | Intelligence | OPERATIONAL | PASSED 2026-11-21 in Node on this VM: Qwen1.5-0.5B-Chat loaded in 6.0s (cached), answered "Two plus two equals four." in 2,976 ms (~1.7 tok/s). Also passed through the engine path the same day (test:milestone-10-engine, browser chat defaults). Full log in docs/MILESTONE-10.md. Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): "The sum of 2 and 2 is equal to four.", Diagnostics 6/6 PASS. |
| Agent pipeline (11 stages) | Intelligence | OPERATIONAL | `src/intelligence/pipeline.ts` implements all 11 stages with real stage events, timing, evidence records. |
| Capability registry | Intelligence | OPERATIONAL | Registry loads; tests assert no OPERATIONAL entry lacks evidence. |
| Permission gate | Intelligence | OPERATIONAL | `src/intelligence/permissions.ts` denies restricted actions unless the owner approves them in-session. |
| Local-first memory | Intelligence | OPERATIONAL | `src/intelligence/memory.ts` persists to IndexedDB with localStorage fallback; nothing leaves the device. |
| Diagnostics | Intelligence | OPERATIONAL | `src/intelligence/diagnostics.ts` measures model state, adapter, counted outbound requests, storage. Can report FAIL. |
| System Settings | Experience | OPERATIONAL | `src/intelligence/settings.ts`: cloud OFF by default, keys session-only by default, model management present. |
| Agent spawn | Intelligence | OPERATIONAL | `src/intelligence/agents.ts`: spawn registers, runs, records result + evidence. |
| Nexus orb | Experience | OPERATIONAL | Vendored from `NVKGLOBAL/nvknexusorb` (NexusOrb.tsx blob `20410bb0`). States driven only by real pipeline state. |
| Resonance visualizer | Experience | OPERATIONAL | Vendored from `NVKGLOBAL/-CODEXA` `ResonanceVisualizerPanel.tsx`. Real particle bursts per generation event. |
| Knowledge graph | Experience | OPERATIONAL | Vendored from `NVKGLOBAL/-CODEXA` `EmergentLogicWeb.tsx`. Data-driven from the registry + pipeline stages. |
| Cloud provider — Gemini | Intelligence | BLOCKED | No key, cloud OFF by default. Blocked on owner opt-in + key. |
| Cloud provider — OpenAI | Intelligence | BLOCKED | No key, cloud OFF by default. Blocked on owner opt-in + key. |
| Payments / checkout | Sovereign Infrastructure | MISSING | CODEXA pricing decided (1 week free, then $20/mo); no provider wired. |
| Wallet / chain / explorer | Sovereign Infrastructure | MISSING | No such code exists in any NVK repo (verified in the unification inventory). |
| Publishing | Sovereign Infrastructure | BLOCKED | No destination wired; needs explicit authorization per action. |
| Evidence store | Sovereign Infrastructure | OPERATIONAL | `src/sovereign/evidence.ts` records with content hashes; re-verify recomputes and reports pass/fail. |

## Rules

- Nothing is OPERATIONAL without evidence. A status change requires a passing
  test or a verified run, never a claim.
- SIMULATED entries must not exist in the shipped registry. If something is
  simulated, it is labelled SIMULATED and never presented as working.
- This file is updated only when the code registry changes.
