# Phase A — State Discipline (v0.1.5)

**Date:** 2026-11-22 · **Scope:** orb re-engineering Phase A (discovery §7) — build + test only, no deploy.
**Rule:** the orb shows what it is really doing. Every orb transition cites a real pipeline stage event. Nothing else may move it.

## 1. Audit result (what the Agent had / did not have)

Audited `src/` in full (grep + file reads, 2026-11-22). The discovery's expectation was **confirmed**: the OS repo's dishonest wiring was never ported into the Agent.

| OS-repo pattern (discovery §3) | In the Agent? | Evidence |
|---|---|---|
| 600 ms `setTimeout` step completion (`handleExecuteNVKAction`) | **NO** | No such function. `pipeline.ts` emits each stage when the stage actually runs; `emit()` is synchronous inside the stage. |
| Dead scripted state sequence (built, never executed) | **NO** | No sequence data exists. The orb has exactly one input: `subscribeToStages` in `OrbHost.tsx`. |
| Canned keyword-answer fallback (scripted text when no model is loaded) | **NO** | `inference.ts` header states it explicitly: "NO canned fallback. If no model is loaded, generate() throws ModelNotLoadedError." `pipeline.ts` answers demo mode with an honest "Demo mode — no model is loaded…" message and never a computed answer (asserted in `tests/orb-state-discipline.test.ts`). |
| 7-state orb-state type | **NO** | `orb-state.ts` defines exactly 8 states. The OS type name appears nowhere in `src/` (asserted by test). |
| 11-state event vocabulary | **NO** | The pipeline defines exactly 11 *stages* (a different concept: work steps, not orb states). The OS events module's vocabulary is not imported anywhere. |
| Timer-driven orb transition | **YES — one, removed** | `OrbHost.tsx:55` (v0.1.4): `window.setTimeout(() => setState('idle'), 4000)` after the `result` stage. The orb showed 'idle' with no pipeline event behind it. **Removed in Phase A.** The last real state now stands until the next real stage event arrives. |

### Timers that remain — and why they are not on the orb path

The source grep for `setTimeout`/`setInterval` found timers in exactly these places; none of them moves the orb's activity state:

- `vendor/CodexOrbSystem.tsx:72` — 100 ms mount flag (`setIsReady`). Scene setup only.
- `vendor/CodexPortalAnimation.tsx`, `FractalBurst.tsx`, `ThresholdAnimation.tsx`, `NexusOriginSeal.tsx` — animation-end callbacks (`onAnimationEnd` after a fixed duration). Portal effects, not states.
- `vendor/audio.ts` (4 sites) — oscillator teardown after a gain ramp. Audio cleanup.
- `visualizers/EmergentLogicWeb.tsx:480` — 50 ms drag-flag reset. Input handling.

The guard test (`tests/orb-state-discipline.test.ts`) asserts the three files on the orb-state path — `OrbHost.tsx`, `orb-state.ts`, `pipeline.ts` — contain no `setTimeout`/`setInterval` at all. Any future timer on that path fails the build's tests.

## 2. The adopted vocabulary (the ONE orb-state vocabulary)

`src/experience/orb/orb-state.ts` — exactly 8 states, in pipeline order:

`idle | listening | thinking | planning | executing | verifying | complete | blocked`

- `blocked` is set only from a real event: the permission stage event whose note starts with `DENIED` (`orbStateForStageEvent`). A denied restricted action previously read as 'executing' (the stage alone maps there); Phase A corrects that — the run is halted, and the orb must say so.
- There is no `discovery` state. The OS repo's gold state has no pipeline event behind it in this Agent, so it is deliberately absent. Add it only when a real event produces it.

## 3. The visual-input interface

`OrbVisualInput { color: string; entropy: number; pulse: number }`, via `orbVisualForState(state)` in `orb-state.ts`. Values adapted from the OS repo's orb animation loop (discovery §2):

| State | Color | Entropy | Pulse | Source |
|---|---|---|---|---|
| idle | `#1ab3ff` (cyan) | 0.10 | 1.0 | Shader's own hardcoded cyan — identical at rest |
| listening | `#3b82f6` (blue) | 0.15 | 1.2 | OS LISTENING blue |
| thinking | `#a855f7` (purple) | 0.40 | 2.2 | OS THINKING, exact |
| planning | `#c084fc` (lavender) | 0.35 | 1.8 | Between thinking and executing |
| executing | `#22c55e` (green) | 0.25 | 1.5 | OS ACTING green + entropy 0.25 |
| verifying | `#2dd4bf` (teal) | 0.20 | 1.3 | Adjacent to executing, cooler |
| complete | `#3dff9e` (emerald) | 0.10 | 1.0 | Footer's existing complete color |
| blocked | `#ff5a5a` (red) | 0.60 | 0.8 | OS ERROR red + entropy 0.6; slow pulse reads as halted |

The host (`OrbHost.tsx`) passes the input into the renderer as `visualInput`; the vendored shader orb applies it through `uColor`/`uEntropy` uniforms and a pulse-scaled inner-core pulse (`NexusOrb.tsx`, v0.1.5-marked edits). Colors lerp toward the target (same 0.08 smoothing as hover), so a state change sweeps instead of snapping. With no visual passed, the orb renders exactly as before — the defaults reproduce the original hardcoded look.

The footer status dot now uses the same `orbVisualForState(state).color` — one mapping, no second source of truth. The local `stateColor()` function was deleted.

## 4. What Phase B must NOT introduce

- Neither competing vocabulary (the OS 7-state type, the 11-state event vocabulary).
- No timer on the orb-state path (guard test fails the build if one appears).
- No scripted state sequence, no canned answer fallback, no step completion by timeout.
- No visualization of BLOCKED/MISSING capabilities (cloud providers, payments, wallet/chain/explorer, publishing) — see discovery §5 rows 17–20. The orb shows BLOCKED as a state, not as a feature.
- The Phase B renderer swap (OS repo's 139 KB `CodexOrbSystem`) must re-prove, against the new file, everything this interface proves against the current one: orb visible, particles in-scene, gateways clickable, phone layout clean, labels not rendering through the orb — plus per-state color/entropy/pulse driven only by real events.

## 5. Files changed (v0.1.5)

- `src/experience/orb/orb-state.ts` — contract header, `ORB_STATES`, `orbStateForStageEvent`, `OrbVisualInput` + `orbVisualForState`. No stage mapping changed.
- `src/experience/orb/OrbHost.tsx` — timer removed; `orbStateForStageEvent` subscription; `visualInput` passed to the renderer; footer dot from the interface; local `stateColor()` deleted.
- `src/experience/orb/vendor/NexusOrb.tsx` — `uColor`/`uEntropy` uniforms (both shaders), `update()` takes an optional visual (color lerp, entropy lerp, pulse-scaled pulse speed). Defaults reproduce the original look.
- `src/experience/orb/vendor/CodexOrbSystem.tsx` — optional `visualInput` prop, kept in a ref (same pattern as `onGatewaySelect`), passed to `nexusOrb.update()` each frame.
- `tests/orb-state-discipline.test.ts` — 6 new tests (exit test + blocked + visual table + no-timer guard + no-canned-machinery guard + no-canned-answers).
- `docs/VENDOR-NOTES.md` — NexusOrb + CodexOrbSystem rows updated.
- `package.json` + `src/App.tsx` footer — version 0.1.4 → 0.1.5.
