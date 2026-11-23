# Vendor Notes — what was copied, from where, and what changed

NVK's own code is an asset: it is preserved verbatim, never simplified away.
This file records exactly what was vendored into this repo, its source, and
the only changes made (import paths for the new layout).

## Orb system — `src/experience/orb/vendor/`

Source: `NVKGLOBAL/nvknexusorb` (private). Recovered 2026-11-21 by the
unification gap-fill pass (SHA-verified where recorded).

| File | Source blob SHA | Changes |
|---|---|---|
| NexusOrb.tsx | `20410bb0f5fde5fc8740581d0a52c16a9caed8b0` | v0.1.5 (Phase A): `uColor`/`uEntropy` uniforms on both shaders + optional visual argument on `update()` (color/entropy/pulse from the host's OrbVisualInput). Defaults reproduce the original hardcoded look. **v0.1.6 (Phase B): UNMOUNTED asset — the renderer is now the NVK-AI-OS CodexOrbSystem port (see below). Kept as the preserved asset; the v0.1.5 file content survives in GitHub main commit `425a94c2`.** |
| CodexOrbSystem.tsx | NVK-AI-OS @ `b723bc4d9` (2026-09-21), `components/CodexOrbSystem.tsx` (139,293 B) | **v0.1.6 (Phase B — renderer swap): REPLACES the nvknexusorb CodexOrbSystem vendored in v0.1.0.** Ported by anchor-based transform (source snapshot in `~/workspace/nvk-unified/orb-port-source/`): GLSL shaders + particle effect + orb-mode construction effect verbatim; mount effect adapted (gateway ring replaces axiom/panel nodes; canvas-scoped listeners; Phase A `OrbVisualInput` is the only state driver). Full ported-vs-not-ported list in `docs/PHASE-B-RENDERER-SWAP.md`. Two strict-mode fixes applied to the output (documented there). |
| osTypes.ts | NVK-AI-OS @ `b723bc4d9`, `types.ts` (44,421 B) | v0.1.6 (Phase B): only the orb-relevant types ported — `OrbMode`, `CodexModeId`, `PanelLayout`, `ParticleBackgroundMode` enums + `CodexModeDefinition` type, verbatim. The rest of the OS types file (ClusterNode, SubAgent, ThoughtGlyph, PanelDefinition, ritual types) is Phase C or never and was NOT ported. |
| CodexModes.ts | NVK-AI-OS @ `b723bc4d9`, `components/core/CodexModes.ts` (12,334 B) | v0.1.6 (Phase B): 15 preset definitions + `getCodexModeDefinition` / `getPresetsForCodexMode`, verbatim except the import lines (`../../types` → `./osTypes`). NOT wired to any UI yet — the seam for a future mode selector. `presetPanelIds` name OS panels that do not exist in this app (Phase C). |
| CodexPortalAnimation.tsx | `cfa2b4e` (short) | Import `../types` → `./types` (stale path in source; the file used to live in `components/`). |
| FractalBurst.tsx | `1aee583` (short) | None. |
| ParticleBackground.tsx | `4d82810` (short) | None. 250k-point galaxy. **Unmounted since v0.1.4** (it sat under the opaque bloom canvas and could never be seen); the galaxy now renders inside the orb scene. File kept as the asset. |
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
