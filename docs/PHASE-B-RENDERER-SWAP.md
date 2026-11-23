# Phase B — Orb Renderer Swap (v0.1.6)

**Date:** 2026-11-22. **Status: BUILT + VERIFIED. NOT deployed, NOT pushed.**
**Source:** NVKGLOBAL/NVK-AI-OS @ `b723bc4d9` (2026-09-21), public repo.
**Source snapshot (durable):** `~/workspace/nvk-unified/orb-port-source/`
(`CodexOrbSystem.tsx` 139,293 B / 3,166 lines, `CodexModes.ts` 12,334 B,
`types.ts` 44,421 B — byte sizes re-verified identical to the discovery
record after re-download).

**What changed:** the orb renderer is now the OS repo's `CodexOrbSystem`
(the Perlin-displaced shader core, 11 particle modes, 11 orb modes),
behind the Phase A `OrbVisualInput` interface. The interface is the
stable seam: the host passes one color/entropy/pulse per real pipeline
state, and the renderer only applies it. OrbHost, orb-state.ts, the
pipeline, the inference engine, and the download path are untouched.

## Corrections to the discovery record (found while porting)

The discovery doc (`~/workspace/nvk-unified/orb-reengineering-discovery-2026-11-22.md`)
said 12 particle modes + 12 orb modes and 6,137 lines. The actual OS file
is **3,166 lines** with **11 orb modes and 11 particle modes** (10 + None
for particles) — read from the real enums in `types.ts`. The discovery's
byte size (139,293 B) was exact. `CodexModes.ts` holds **15** preset
definitions, not 16 (matches the 15-value `CodexModeId` enum). The
download-path pre-check is named `isModelWeightsCached`, not
`isModelCached`.

## Ported (verbatim unless noted)

- **GLSL shaders** — vertex (Perlin displacement) + fragment (torus core,
  helical flow, grid, scanlines, Fresnel glow, entropy color shift),
  byte-for-byte. Uniforms `uColor` / `uTime` / `uEntropy` / `uHover` /
  `uMouse` / `uClickPos` / `uClickRadius` / `uClickForce` /
  `uTorusFactor` / `uFlowFactor` / `uGridFactor` / `uScanlineFactor`.
- **Particle effect** — the `useEffect` on `[particleMode]`, all 11 modes
  (Orbital, Galaxy, Stardust, Wormhole, CosmicWeb, NeutrinoStream,
  QuantumFoam, NebulaCloud, SupernovaRemnant, AetherFlow, None), each
  building a THREE.Group in-scene. Plus the mount effect's per-mode
  particle animation switch (10 cases).
- **Orb-mode construction effect** — all 11 modes (HolographicCore is
  the default; 10 `case` branches). PhotoGallery reads the `photoSources`
  prop; empty → the OS file's own placeholder torus.
- **Mount effect skeleton** — renderer + EffectComposer + UnrealBloomPass
  + CSS3DRenderer setup, ResizeObserver sizing, OrbitControls, the
  animate loop (physics, click-wave, hover raycast, render).
- **HUD** — Focus + Reset text buttons, "The Nexus Orb" / "Select a
  Gateway Node" heading overlay, ProjectViewer modal on gateway select,
  renderer-error UI with genuine retry (retryCount re-inits).
- **CSS3DRenderer** — kept, empty in Phase B, because Phase C needs it.

## Ported with adaptation (each marked inline in the file)

- **S-A gateway ring** — the OS file's orbiting nodes are its axiom nodes
  (OS-lore labels, no function) and cluster/panel nodes (Phase C).
  Replaced with the Agent's 4 gateways (sphere 1.5, ring radius 12,
  labels 6×1.5, connector lines), rescaled to the OS scene (core radius
  5, camera z=25). Core lookup prefers the VISIBLE core (the OS file
  resolved the default orb first even when its mode hides it, so a
  raycast could hit an invisible orb).
- **S-B tap handler** — interactables are the core orb + 4 gateways.
  Core tap: click sound, scale impulse, wobble, click wave, camera
  reset to z=14. Gateway tap: click sound, `setSelectedGateway`,
  `onGatewaySelect` to the host. Core-orb proximity fallback (ray
  within 6.5 units of origin) kept — it is the OS file's own touch
  tolerance.
- **S-C/S-D window listeners → canvas-scoped** — pointer/touch/mouse
  listeners are on `renderer.domElement`, not the window. The OS file
  listens on window because its orb is full-screen; here the orb is a
  panel, and a window-level click listener would raycast clicks on the
  DOM gateway buttons below the canvas (a click just below the panel can
  pass within the core-orb proximity fallback and reset the camera).
  The window `resize` listener stays (ResizeObserver handles panel
  resizes; the window listener covers viewport changes). Cleanup mirrors
  the registration.
- **S-G/S-H state mapping → OrbVisualInput** — the OS file's 7-state
  vocabulary and per-state boost table are NOT ported. The animate loop
  reads `visualInputRef.current` once per frame: `entropyValue =
  visual?.entropy ?? 0.1`; `uColor` lerps toward `visual?.color ??
  '#1ab3ff'`; `uTime` runs at `elapsedTime * pulseSpeed * (visual?.pulse
  ?? 1.0)`; `uEntropy = min(1.0, entropyValue)`. The boost is already
  folded into `OrbVisualInput` by `orbVisualForState` (thinking entropy
  0.4 + pulse 2.2, blocked 0.6, ...). There is deliberately no DISCOVERY
  gold and no ERROR state — no pipeline event produces them.
- **S-I EntropicStorm factor** reads the visual entropy.
- **S-M gateway animation** — idle drift only (0.001/dtSim); drag orbits
  the CAMERA (OrbitControls), not the ring. Far-side labels fade
  (`facing > -0.25 ? 0.8 : 0`), hovered labels scale 1.2 (v0.1.4).
- **S-P hover raycast** — core + gateways only; hovered gateway plays
  the hover sound once per change. The OS file's hover `uEntropy` gsap
  tween is NOT ported: it is dead against the per-frame write of the
  same uniform in the loop above (the same tween's restore branch,
  which referenced `systemState.entropy`, is deleted with it).
- **S-T frame-error catch** — the OS file injected a `#debug-error` div
  into the page on frame errors; the port logs to console only.
- **S-T2 panel lookAt loop** — deleted (no panels in Phase B); the
  `cssRenderer.render` call stays.
- **S-V shader orb starts at the idle color** (`0x1ab3ff`), not the OS
  file's green (`0x10fa70`).
- **S-W shader factors are module constants** (`TORUS_FACTOR` 1.8,
  `FLOW_FACTOR` 4.0, `GRID_FACTOR` 2.2, `SCANLINE_FACTOR` 0.12) — the OS
  file exposes them as props; this app has no tuning UI yet.
- **S-X camera zoom bounded** (`minDistance` 12, `maxDistance` 40) —
  the OS file sets no limits.
- **HUD trimmed** — Focus + Reset only. The OS file's zoom buttons are
  not ported (OrbitControls already zooms on wheel/pinch; a 4-button
  stack would cover the gateway ring in a 340–520px panel). Text
  labels, not the OS file's Remix Icon font (`ri-*`), which this app
  does not ship. The 100 ms `isReady` fade is DROPPED — the ported file
  contains no `setTimeout` at all.

## Deliberately NOT ported (with reasons)

- **OS 7-state vocabulary + SystemContext entropy** — the Agent's 8
  states + `OrbVisualInput` are the only driver (Phase A). Porting the
  OS vocabulary would create a second source of truth.
- **Console.log event-bus subscription** — the OS "live event feed" is
  a console.log no-op; the Agent's real 11-stage pipeline events are
  the only feed.
- **600 ms timer step completion** — timer theater; the Agent has no
  timers on the orb path.
- **Dead `orbStateSequence`** — scripted state data with no driver.
- **Canned/deterministic fallback** (`generateDeterministicFallback`) —
  the Agent never fabricates an answer; no model means an error.
- **Cache-OFF behavior** — the OS file disables the Cache API (the
  v0.1.1 bug); the Agent's weights cache stays ON with the
  `.onnx`-specific pre-check (`isModelWeightsCached`).
- **Axiom nodes** — OS-lore labels with no function; they would compete
  with the gateways for the same orbit.
- **Cluster/panel system + CSS3D pinned panels** — Phase C. The OS
  lines 2264–2716 (axiom-reveal effect, sub-agent constellation
  builder, thought-glyph builder, panel-object effects) and the 100 ms
  panel-focus `setTimeout` at OS:2710 were dropped with them.
- **Sub-agent constellation + thought glyphs** — Phase C.
- **Voice** (`isLiveActive` / `liveVolume`) — no voice input in the
  Agent.
- **Flight / omniwheel navigation, auto-recenter, follow-lock** — the OS
  orb is a full-screen 6-DOF workspace; here it is a panel. The
  auto-recenter would fight the user's camera.
- **Gemma 4B→1B model entry, fabricated `/api/export` +
  `/api/share/shard` URLs, open `/api/agent/dispatch` bash endpoint** —
  not orb code at all; the OS repo's own defects, not ported.
- **`CodexModes.ts` `presetPanelIds`** — the field is ported verbatim
  (the file is the seam for a future mode selector) but names OS panels
  that do not exist in this app; a selector must ignore it until
  Phase C, and must never invent panels to fill it.

## v0.1.4 requirements re-proven against the new renderer

- Particles live IN-SCENE (the 11 particle modes build groups inside
  the scene graph, composited through the bloom pass) — never mounted
  under an opaque layer. No `<ParticleBackground/>` is mounted.
- Gateway clicks measured from the CANVAS RECT
  (`getBoundingClientRect()`); `window.innerWidth/Height` appear only
  as zero-size fallbacks.
- The 4 DOM gateway buttons are KEPT (Vision→chat, Codex→visualizers,
  Nexus→agents, Lore→diagnostics) in OrbHost, driven by the same
  `handleGatewaySelect` as canvas clicks.
- ResizeObserver sizing; orb 340px phones / 520px desktop
  (`src/index.css`, `.orb-canvas`); `.orb-panel canvas` forced to
  100% w/h; nav wraps (`.app-nav`).
- Far-side labels fade; camera zoom bounded; no phone overflow
  (panels `overflowX: auto`, nav wraps).
- Tailwind ships: `@import "tailwindcss"` in `src/index.css`, and the
  built CSS contains `.orb-panel canvas{width:100%!important;
  height:100%!important}`.

## Strict-mode fixes (applied to the ported output)

The OS repo compiles under looser settings; this repo's tsconfig is
strict. Two behavior-neutral fixes, marked inline:

1. `resolveCoreOrb` returns `getObjectByName('core_orb') ?? null`
   (`getObjectByName` returns `Object3D | undefined`, the function
   returns `| null`).
2. `points.userData.originalColors = (colorsAttr.array as
   Float32Array).slice()` (the `colorsArr` ternary's nullability is
   invisible to the compiler inside the `colorsAttr`-truthy branch).

## Port procedure note

The port was produced by an anchor-based Python transform
(`/tmp/os-orb/port.py`, 39,578 B) that asserted every surgery anchor
existed exactly as expected and failed loudly on drift (five real
finds while running it: a missing list bracket, a hover-tween
`systemState.entropy` the design had missed, a twice-occurring
end-anchor, a `panelObjectsRef` lookAt loop, and mode-case counts of
19/21 rather than the assumed 10/11 — all fixed in the script, none
weakened). `/tmp` was wiped between sessions, so the script is gone;
the durable record is the source snapshot above plus this doc and the
guard tests in `tests/orb-renderer-swap.test.ts`. To reproduce the
port: re-fetch the three OS files at `b723bc4d9`, re-apply the
surgeries S-A–S-Y as described here, and re-run the guards.

## Files changed

| File | Change |
|---|---|
| `src/experience/orb/vendor/CodexOrbSystem.tsx` | REPLACED (was the nvknexusorb vendored file, 686 lines / 33,123 B; now the NVK-AI-OS port, 2,269 lines / 104,027 B). Old content survives in GitHub main commit `425a94c2`. |
| `src/experience/orb/vendor/osTypes.ts` | NEW (96 lines): OrbMode, CodexModeId, PanelLayout, ParticleBackgroundMode enums + CodexModeDefinition, verbatim from OS `types.ts`. |
| `src/experience/orb/vendor/CodexModes.ts` | NEW (314 lines): 15 OS presets + lookup helpers, verbatim except import lines. Not wired to any UI. |
| `src/experience/orb/vendor/NexusOrb.tsx` | UNCHANGED code; now an unmounted asset (its Phase A uniforms stay intact). |
| `src/intelligence/capability-registry.ts` + `CAPABILITY-REGISTRY.md` | Nexus-orb evidence updated to the Phase B renderer; `lastVerified` 2026-11-22. |
| `docs/VENDOR-NOTES.md` | CodexOrbSystem / osTypes / CodexModes rows rewritten; NexusOrb + ParticleBackground noted as unmounted assets. |
| `tests/orb-renderer-swap.test.ts` | NEW (300 lines): 10 tests (see below). |
| `package.json` + `src/App.tsx` | Version 0.1.5 → 0.1.6 (footer + package). Test script gains the new file. |

NOT touched: OrbHost.tsx, orb-state.ts, `src/intelligence/` (pipeline,
inference, diagnostics, memory), the model-download path, the CODEXA
fix, the NVK-AI-OS fix. No deploy, no push.

## Exit test — evidence

- `npm test`: **41/41 pass** (31 pre-existing + 10 new). The 10 new
  tests prove: visual input drives the shader uniforms (color/entropy/
  pulse) and nothing else does; no timer on the orb path including the
  new renderer; no canned/scripted OS machinery anywhere in `src/`
  (27 forbidden identifiers, whole-tree scan); all 11 orb modes + all
  11 particle modes present with HolographicCore + Galaxy defaults;
  particles in-scene; canvas-rect raycasting + DOM gateway buttons;
  ResizeObserver sizing, bounded camera, far-side label fade, shipped
  Tailwind; download path untouched; CodexModes presets valid and
  un-wired; version 0.1.6.
- `npx tsc --noEmit`: **clean**.
- `npm run build`: **succeeds in 9.20s** (final run, after the registry
  evidence edit). New bundles:
  `dist/assets/index-BvtcY5fb.js` (1,120.97 kB),
  `dist/assets/index-TBXhqW-I.js` (775.71 kB),
  `dist/assets/CodexOrbSystem-DwTyfHWJ.js` (68.13 kB, split out by the
  lazy import in OrbHost),
  `dist/assets/index-uKeYEdX1.css` (30,246 B).
- `npm run test:milestone-10-pipeline`: **PASS** — real Qwen1.5-0.5B-Chat
  answers "Two plus two equals four." twice through the chat path
  (11.4s load). The swap did not touch the intelligence it reflects.
- Retest #4 checklist (orb visible, particles present, gateways
  clickable canvas + DOM, no label overlap, no phone overflow):
  re-proven at the code level by the tests above. **A live-browser
  retest is NOT part of this phase and has not happened** — the browser
  check comes after deploy, as before. Do not claim the phone version
  is ready until that retest passes.
