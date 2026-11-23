/**
 * NVK Agent — orb renderer-swap tests (v0.1.6, Phase B).
 *
 * Run: npm test
 *
 * Phase B (orb re-engineering, discovery §7): NVK-AI-OS's CodexOrbSystem
 * + CodexModes are now the renderer, behind the Phase A OrbVisualInput
 * interface. The visuals were ported; the dishonest wiring was not.
 * These tests prove the retest #4 checklist at the code level — a live
 * browser retest is NOT part of this phase (subagents have no browser)
 * and still comes after deploy, as before:
 *
 * 1. The visual input drives the shader orb's uniforms (color /
 *    entropy / pulse) and nothing else does — no OS state vocabulary,
 *    no per-state boost table in the renderer.
 * 2. No timer exists on the orb path, including the new renderer.
 * 3. No canned/scripted OS machinery was introduced anywhere in src/.
 * 4. All 11 orb modes + all 11 particle modes are present, with the
 *    HolographicCore + Galaxy defaults.
 * 5. Particles live IN-SCENE (the particle system is part of the
 *    composited output) — no separate <ParticleBackground/> layer.
 * 6. Gateway clicks use the canvas rect (window size only as a
 *    zero-size fallback), and the 4 DOM node buttons are kept.
 * 7. ResizeObserver sizing, bounded camera, far-side label fade, and
 *    the shipped styling system (Tailwind + orb-panel rules).
 * 8. The model-download path is untouched by the renderer (separate
 *    browser diagnosis; the renderer imports nothing from intelligence).
 * 9. CodexModes presets are valid — and not wired to any UI yet.
 * 10. Version is 0.1.8.
 *
 * v0.1.8 (node rebuild, 2026-11-22): the 4 legacy Nexus gateways
 * (Vision / Codex / Nexus / Lore) are gone — replaced by the Agent's
 * own nodes (Agents / Evidence / Diagnostics / System), each opening a
 * real panel. The gateway test below now pins the new nodes; the
 * ProjectViewer modal is deleted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OrbMode,
  ParticleBackgroundMode,
  CodexModeId,
} from '../src/experience/orb/vendor/osTypes';
import {
  CODEX_MODES_DEFINITIONS,
  getPresetsForCodexMode,
} from '../src/experience/orb/vendor/CodexModes';
import { NVK_AGENT_NODES } from '../src/experience/orb/vendor/constants';
import { orbVisualForState } from '../src/experience/orb/orb-state';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const RENDERER = 'src/experience/orb/vendor/CodexOrbSystem.tsx';

test('renderer swap: the visual input drives the shader uniforms — color, entropy, pulse', () => {
  const src = read(RENDERER);
  // The animate loop reads the Phase A input once per frame and applies
  // all three channels to the shader orb.
  assert.ok(src.includes('const visual = visualInputRef.current;'));
  assert.ok(src.includes('const entropyValue = visual?.entropy ?? 0.1;'));
  assert.ok(src.includes("const targetColor = new THREE.Color(visual?.color ?? '#1ab3ff');"));
  assert.ok(src.includes('orb.material.uniforms.uColor.value.lerp(targetColor, 0.1 * dtSim);'));
  assert.ok(src.includes('orb.material.uniforms.uTime.value = elapsedTime * pulseSpeed * (visual?.pulse ?? 1.0);'));
  assert.ok(src.includes('orb.material.uniforms.uEntropy.value = Math.min(1.0, entropyValue);'));
  // The shader orb starts at the idle color, not the OS file's green.
  assert.ok(src.includes('uColor: { value: new THREE.Color(0x1ab3ff) }'));
  assert.equal(src.includes('0x10fa70'), false, 'OS green start color must not survive');
  // Every Phase A state produces a distinct input the renderer can show.
  const colors = new Set<string>();
  for (const state of ['idle', 'listening', 'thinking', 'planning', 'executing', 'verifying', 'complete', 'blocked'] as const) {
    colors.add(orbVisualForState(state).color);
  }
  assert.equal(colors.size, 8, 'all 8 states map to distinct colors');
  // No OS state vocabulary in the renderer: no 7-state mapping, no
  // per-state boost table. (DISCOVERY / ERROR appear only in the one
  // comment documenting their deliberate absence.)
  for (const name of ['LISTENING', 'THINKING', 'ACTING', 'nvkOrbState', 'systemState']) {
    assert.equal(src.includes(name), false, `renderer must not contain ${name}`);
  }
  const discoveryLines = src.split('\n').filter((l) => l.includes('DISCOVERY'));
  assert.equal(discoveryLines.length, 1, 'DISCOVERY appears only in the absence comment');
  assert.match(discoveryLines[0].trim(), /^\/\//, 'that line is a comment');
});

test('renderer swap: no timer exists anywhere on the orb path, including the new renderer', () => {
  for (const rel of [
    RENDERER,
    'src/experience/orb/OrbHost.tsx',
    'src/experience/orb/orb-state.ts',
    'src/intelligence/pipeline.ts',
  ]) {
    const src = read(rel);
    assert.equal(src.includes('setTimeout'), false, `${rel} must not contain setTimeout`);
    assert.equal(src.includes('setInterval'), false, `${rel} must not contain setInterval`);
  }
});

test('renderer swap: no canned or scripted OS machinery was introduced anywhere in src/', () => {
  // The OS repo's dishonest / unported identifiers. They must not appear
  // in src/ — not as code, not as a comment, not as a type. (The audit
  // record lives in docs/PHASE-B-RENDERER-SWAP.md, which this scan does
  // not cover. Phase A's 3-identifier guard is subsumed here.)
  const FORBIDDEN = [
    'generateDeterministicFallback',
    'orbStateSequence',
    'useIndexedDBCache',
    'CyberSynth',
    'createPortal',
    'debug-error',
    'systemState',
    'nvkOrbState',
    'NVKOrbState',
    'isLiveActive',
    'liveVolume',
    'axiomsRevealed',
    'onNodeHover',
    'onPanelNodeClick',
    'getPanelContent',
    'clusterNodes',
    'openNodeIds',
    'panelLayout',
    'navigationInput',
    'flightInput',
    'recenterTrigger',
    'autoRecenter',
    'subAgents',
    'thoughts',
    'panelObjectsRef',
    'focusedNodeId',
    'isTransitioningRef',
  ];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        for (const name of FORBIDDEN) {
          if (text.includes(name)) hits.push(`${full}: ${name}`);
        }
      }
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(hits, [], `forbidden OS-repo identifiers found in src/: ${hits.join('; ')}`);
});

test('renderer swap: all 11 orb modes and all 11 particle modes are present, with the v0.1.4-look defaults', () => {
  assert.deepEqual(Object.values(OrbMode), [
    'Holographic Core',
    'Crystalline Matrix',
    'Entropic Storm',
    'Chaotic Nucleus',
    'Aetheric Weave',
    'Starlight Conductor',
    'Void Shell',
    'Bio Lattice',
    'Resonant Spire',
    'Temporal Rift',
    'Photo Gallery',
  ]);
  assert.deepEqual(Object.values(ParticleBackgroundMode), [
    'Orbital',
    'Galaxy',
    'Stardust',
    'Wormhole',
    'Cosmic Web',
    'Neutrino Stream',
    'Quantum Foam',
    'Nebula Cloud',
    'Supernova Remnant',
    'Aether Flow',
    'None',
  ]);
  const src = read(RENDERER);
  // Mode switches: 10 in the mode-construction effect + 9 in the
  // animate loop (mode-specific animation); particle switches: 11 in
  // the particle-construction effect + 10 in the animate loop.
  assert.equal((src.match(/case OrbMode\./g) ?? []).length, 19);
  assert.equal((src.match(/case ParticleBackgroundMode\./g) ?? []).length, 21);
  // Defaults: HolographicCore (the shader orb that shows state colors)
  // + Galaxy (the closest to the v0.1.4 galaxy look). No mode-selector
  // UI exists yet — the props are the seam for one.
  assert.ok(src.includes('orbMode = OrbMode.HolographicCore'));
  assert.ok(src.includes('particleMode = ParticleBackgroundMode.Galaxy'));
});

test('renderer swap: particles live in-scene — no separate particle layer under an opaque canvas', () => {
  const src = read(RENDERER);
  assert.ok(src.includes('case ParticleBackgroundMode.Galaxy:'));
  assert.ok(src.includes('scene.add(backgroundParticlesGroupRef.current);'));
  // No separate <ParticleBackground/> layer: the enum name
  // ParticleBackgroundMode legitimately appears (it IS the particle
  // system), so assert on the component, not the substring.
  assert.equal(src.includes('<ParticleBackground'), false, 'renderer must not mount the old separate layer');
  assert.equal(src.includes("from './ParticleBackground'"), false, 'renderer must not import the old separate layer');
  const host = read('src/experience/orb/OrbHost.tsx');
  assert.equal(host.includes('<ParticleBackground'), false, 'host must not mount a separate particle layer');
});

test('renderer swap: node clicks use the canvas rect; the 4 DOM node buttons are kept', () => {
  const src = read(RENDERER);
  // Mouse coordinates come from the canvas bounding rect (v0.1.4
  // lesson: window size squashed the phone render and broke raycasts).
  assert.ok((src.match(/getBoundingClientRect\(\)/g) ?? []).length >= 2);
  // window.innerWidth/Height appear ONLY as zero-size fallbacks.
  for (const line of src.split('\n')) {
    if (line.includes('window.innerWidth') || line.includes('window.innerHeight')) {
      assert.ok(
        line.includes('clientWidth') || line.includes('clientHeight') || line.includes('rect.width') || line.includes('rect.height'),
        `window size must only be a guarded fallback: ${line.trim()}`,
      );
    }
  }
  // Listeners are scoped to the canvas, not the window (a window-level
  // click listener raycast clicks on the DOM node buttons below the
  // canvas). The window resize listener is the only window listener.
  assert.equal((src.match(/window\.addEventListener/g) ?? []).length, 1);
  assert.ok(src.includes("window.addEventListener('resize', handleResize);"));
  assert.ok(src.includes("domElement.addEventListener('pointerdown', handlePointerDown);"));
  // The 4 nodes are the orbiting nodes, and the host reports clicks.
  assert.ok(src.includes('NVK_AGENT_NODES'));
  assert.ok(src.includes('onGatewaySelectRef.current?.(gateway.id);'));
  assert.deepEqual(NVK_AGENT_NODES.map((g) => g.id), ['agents', 'evidence', 'diagnostics', 'system']);
  // DOM buttons: the host renders the same four nodes as real
  // buttons (retest #3 failure was canvas-only text).
  const host = read('src/experience/orb/OrbHost.tsx');
  assert.ok(host.includes('{NVK_AGENT_NODES.map((gateway) => ('));
  assert.ok(host.includes('<button'));
  assert.ok(host.includes('onClick={() => handleGatewaySelect(gateway.id)}'));
});

test('renderer swap: ResizeObserver sizing, bounded camera, far-side label fade, shipped styling', () => {
  const src = read(RENDERER);
  assert.ok(src.includes('new ResizeObserver('), 'panel sizing must use ResizeObserver');
  assert.ok(src.includes('controls.minDistance = 12;'));
  assert.ok(src.includes('controls.maxDistance = 40;'));
  // Far-side labels fade instead of rendering through the orb (v0.1.4).
  assert.ok(src.includes('const targetOpacity = facing > -0.25 ? 0.8 : 0;'));
  // The styling system actually ships (v0.1.3 lesson: vendored Tailwind
  // classes are no-ops without it).
  const css = read('src/index.css');
  assert.ok(css.includes('@import "tailwindcss";'));
  assert.ok(css.includes('.orb-panel canvas {'));
  assert.ok(css.includes('.orb-canvas {'));
  assert.ok(css.includes('height: 340px;'), 'phone orb height');
  assert.ok(css.includes('height: 420px;'), 'desktop orb height (v0.1.8: 520px kept the prompts below the fold)');
  assert.ok(css.includes('.app-nav'), 'nav wraps instead of overflowing on phones');
});

test('renderer swap: the model-download path is untouched by the renderer', () => {
  const src = read(RENDERER);
  assert.equal(src.includes('intelligence'), false, 'renderer must import nothing from intelligence');
  for (const name of ['isModelCached', 'useBrowserCache', '.onnx', 'transformers-cache']) {
    assert.equal(src.includes(name), false, `renderer must not touch the download path (${name})`);
  }
  // And the download path itself is still there, unchanged by the swap.
  const inference = read('src/intelligence/inference.ts');
  assert.ok(inference.includes('isModelWeightsCached'));
  assert.ok(inference.includes('transformers-cache'));
});

test('renderer swap: CodexModes presets are valid — and not wired to any UI yet', () => {
  assert.equal(CODEX_MODES_DEFINITIONS.length, 15);
  const orbValues = new Set(Object.values(OrbMode));
  const particleValues = new Set(Object.values(ParticleBackgroundMode));
  for (const modeId of Object.values(CodexModeId)) {
    const preset = getPresetsForCodexMode(modeId);
    assert.ok(orbValues.has(preset.orbMode), `${modeId} preset orbMode is a real OrbMode`);
    assert.ok(particleValues.has(preset.particleMode), `${modeId} preset particleMode is a real ParticleBackgroundMode`);
    assert.ok(typeof preset.nodeAnimationSpeed === 'number' && preset.nodeAnimationSpeed > 0);
    // presetPanelIds name OS panels that do not exist in this app
    // (Phase C) — a future selector must ignore that field.
    assert.ok(Array.isArray(preset.presetPanelIds));
  }
  // No UI imports the presets yet: the orb defaults stand on their own.
  // (The renderer's header comment names the file as a source reference
  // — that is documentation, not an import — so match import lines.)
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !full.endsWith('vendor/CodexModes.ts')) {
        const text = readFileSync(full, 'utf8');
        if (/from\s+['"][^'"]*CodexModes['"]/.test(text)) hits.push(full);
      }
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(hits, [], `CodexModes must not be imported outside its own file yet: ${hits.join('; ')}`);
});

test('renderer swap: version is 0.1.9', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  assert.equal(pkg.version, '0.1.9');
  assert.ok(read('src/App.tsx').includes('NVK Agent v0.1.9'));
});
