# Vendor Notes — what was copied, from where, and what changed

NVK's own code is an asset: it is preserved verbatim, never simplified away.
This file records exactly what was vendored into this repo, its source, and
the only changes made (import paths for the new layout).

## Orb system — `src/experience/orb/vendor/`

Source: `NVKGLOBAL/nvknexusorb` (private). Recovered 2026-11-21 by the
unification gap-fill pass (SHA-verified where recorded).

| File | Source blob SHA | Changes |
|---|---|---|
| NexusOrb.tsx | `20410bb0f5fde5fc8740581d0a52c16a9caed8b0` | None. `createNexusOrb()` factory, simplex-noise shaders. |
| CodexOrbSystem.tsx | `b65184e` (short) | None. |
| CodexPortalAnimation.tsx | `cfa2b4e` (short) | Import `../types` → `./types` (stale path in source; the file used to live in `components/`). |
| FractalBurst.tsx | `1aee583` (short) | None. |
| ParticleBackground.tsx | `4d82810` (short) | None. 250k-point galaxy. |
| ThresholdAnimation.tsx | `46454ed` (short) | None. |
| NexusOriginSeal.tsx | `35be728` (short) | None. |
| NvkGlyph.tsx | `10e6ee8` (short) | None. |
| constants.ts | Not recorded in gapfill report | None. Holds `NEXUS_GATEWAYS`. |
| audio.ts | Not recorded in gapfill report | None. Click/hover sounds. |
| ProjectViewer.tsx | Not recorded in gapfill report | Import `../types` → `./types` (types.ts sits in the same dir here). |
| types.ts | Not recorded in gapfill report | None. |

Not vendored: `kindness-visualizer.ts` — it is a CSS-class toggle, not a
visualizer, and the gap-fill report says not to treat it as one.

## Visualizers — `src/experience/visualizers/`

Source: `NVKGLOBAL/-CODEXA` (private), `components/`.

| File | Source | Changes |
|---|---|---|
| ResonanceVisualizerPanel.tsx | `components/ResonanceVisualizerPanel.tsx` | Import `../types` → `./types`; `../context/WebGLContext` → `./webgl-context` (local re-implementation, same real probe). |
| EmergentLogicWeb.tsx | `components/EmergentLogicWeb.tsx` | Import `../types` → `./types`. |
| ResonanceField.tsx | `components/ResonanceField.tsx` | Import `../types` → `./types`. |
| types.ts | New, local | Field shapes derived from what the components actually read. No invented behavior. |
| webgl-context.tsx | New, local | Real WebGL probe (`getContext('webgl2' \| 'webgl')`). |

## What was NOT copied

CODEXA's `TransformersBrainService.ts` and `LocalModelRegistryService.ts`
were read as reference (inspiration for the architecture) but **not copied**:
the inference engine in `src/intelligence/inference.ts` is a fresh
implementation. The deliberate differences:
- No `generateSemanticResponse` canned fallback — no model means an error.
- No placeholder SHA-256 hashes in the model catalog.
- Validation is the real milestone-10 test (2+2 → 4), not a `runBrain('ping')`
  length check.
- Cloud is never the silent fallback when local fails.
