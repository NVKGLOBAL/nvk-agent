/**
 * NVK Agent — orb life tests (v0.1.9, 2026-11-22).
 *
 * Run: npm test
 *
 * The owner directed (2026-11-22) that the WebSim original's life be
 * ported into our orb: the flare, the auto-orbit, and the halo. The
 * original (NvK's own Codex Orb System, a purely visual ambient sim)
 * has no function — clicks do nothing, nodes open nothing. We keep
 * our function and port only the life, under hard honesty rules:
 *
 * 1. FLARE fires on a REAL pipeline completion only (a 'result' stage
 *    event → orb state 'complete'). It is an event edge, not a state:
 *    the host counts completions, the renderer turns each edge into
 *    an intensity of 1.0, and it decays exponentially in real seconds.
 *    No timer anywhere on this path; the orb state never moves on decay.
 * 2. AUTO-ORBIT oscillates gently INSIDE the v0.1.8 front arc
 *    (±20°, never a revolution). The original's full revolution hides
 *    panels behind the sphere — we do not copy that. All four labels
 *    stay visible at once (every node z > 0 at all times).
 * 3. HALO is a green/cyan particle shell hugging the core, built in
 *    the same particle effect as the mode particles (same group, same
 *    cleanup, same vertex-color post-processing — an added layer of
 *    the one particle system, not a second system). Its color is the
 *    REAL orb state, its opacity/size breathe with entropy and
 *    brighten on a flare.
 *
 * The original's rotating poetic quotes are NOT ported: a quote line
 * would be canned decoration. No quote machinery is added anywhere.
 *
 * A live-browser visual check is still owed after deploy (subagents
 * have no browser): confirm the flare fires visibly on a real
 * completion, the ring drifts without hiding a label, and the halo
 * reads as a green/cyan shell that follows the state color.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLARE_HALF_LIFE_S,
  FLARE_MAX_INTENSITY,
  flareIntensityAfter,
  shouldFlareOnStageEvent,
  haloOpacityFor,
  haloSizeFor,
} from '../src/experience/orb/orb-life';
import {
  nodeOrbitOffset,
  orbitedNodeAngleDeg,
  orbitedNodePosition,
  NODE_ARC_ANGLES_DEG,
  NODE_RING_RADIUS,
  ORBIT_AMPLITUDE_DEG,
  ORBIT_ANGULAR_SPEED_RAD_S,
} from '../src/experience/orb/node-layout';
import { orbVisualForState, type OrbActivityState } from '../src/experience/orb/orb-state';
import type { StageEvent } from '../src/intelligence/pipeline';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const RENDERER = 'src/experience/orb/vendor/CodexOrbSystem.tsx';
const HOST = 'src/experience/orb/OrbHost.tsx';

function stageEvent(stage: StageEvent['stage'], note?: string): StageEvent {
  return { stage, at: Date.now(), elapsedMs: 0, note };
}

test('v0.1.9 flare: intensity decays exponentially with a 0.8 s half-life, never negative, never above 1', () => {
  assert.equal(FLARE_HALF_LIFE_S, 0.8);
  assert.equal(FLARE_MAX_INTENSITY, 1.0);
  // One half-life halves the intensity.
  assert.ok(Math.abs(flareIntensityAfter(1, 0.8) - 0.5) < 1e-9);
  assert.ok(Math.abs(flareIntensityAfter(1, 1.6) - 0.25) < 1e-9);
  assert.ok(Math.abs(flareIntensityAfter(0.5, 0.8) - 0.25) < 1e-9);
  // Ten half-lives is negligible → exactly 0 (the loop stops writing it).
  assert.equal(flareIntensityAfter(1, 8.0), 0);
  assert.equal(flareIntensityAfter(1, 100), 0);
  // Zero stays zero; a non-positive delta leaves the intensity unchanged.
  assert.equal(flareIntensityAfter(0, 5), 0);
  assert.equal(flareIntensityAfter(0.6, 0), 0.6);
  assert.equal(flareIntensityAfter(0.6, -1), 0.6);
  // Inputs above 1 are capped, never amplified.
  assert.equal(flareIntensityAfter(2, 0), 1.0);
  assert.ok(flareIntensityAfter(2, 0.8) <= 0.5 + 1e-9);
});

test('v0.1.9 flare: fires ONLY on a real pipeline completion (result → complete)', () => {
  // The one transition that maps the orb to 'complete'.
  assert.equal(shouldFlareOnStageEvent(stageEvent('result')), true);
  // Every other stage must NOT flare — including the stages that
  // precede a completion and the blocked halt.
  const noFlare: StageEvent['stage'][] = [
    'input', 'intent', 'context', 'reasoning', 'planning',
    'capability', 'permission', 'execution', 'verification', 'evidence',
  ];
  for (const stage of noFlare) {
    assert.equal(shouldFlareOnStageEvent(stageEvent(stage)), false, `${stage} must not flare`);
  }
  // A DENIED permission maps to 'blocked', not 'complete' — no flare.
  assert.equal(shouldFlareOnStageEvent(stageEvent('permission', 'DENIED: publishing needs approval')), false);
  // A granted permission is 'executing' — no flare either.
  assert.equal(shouldFlareOnStageEvent(stageEvent('permission', 'GRANTED')), false);
});

test('v0.1.9 flare: event-driven, never timer-driven — no timer on the flare path', () => {
  // The flare path is OrbHost (counts completions) + orb-life.ts
  // (pure decay/trigger) + the renderer's loop (applies it). None of
  // those files may contain a timer: the decay is a frame-delta
  // function, like the existing click-impulse spring.
  for (const rel of ['src/experience/orb/orb-life.ts', 'src/experience/orb/OrbHost.tsx']) {
    const src = read(rel);
    assert.equal(src.includes('setTimeout'), false, `${rel} must not contain setTimeout`);
    assert.equal(src.includes('setInterval'), false, `${rel} must not contain setInterval`);
  }
  // The host counts completions through the pure trigger — one
  // increment per 'result' event — and passes the count down.
  const host = read(HOST);
  assert.ok(host.includes('shouldFlareOnStageEvent(event)'), 'host must use the pure flare trigger');
  assert.ok(host.includes('setFlareSignal((n) => n + 1)'), 'host must count completions');
  assert.ok(host.includes('flareSignal={flareSignal}'), 'host must pass the signal to the renderer');
  // The renderer turns the signal edge into an intensity and decays
  // it from the frame delta — and the shader has the uniform.
  const renderer = read(RENDERER);
  assert.ok(renderer.includes('flareSignalRef'), 'renderer must mirror the signal in a ref');
  assert.ok(renderer.includes('flareIntensityAfter(flareIntensityRef.current, delta)'), 'renderer must decay from the real frame delta');
  assert.ok(renderer.includes('uniform float uFlare;'), 'orb shader must declare the flare uniform');
  assert.ok(renderer.includes('uFlare: { value: 0 }'), 'orb material must initialise the flare uniform');
  assert.ok(renderer.includes("mix(lighting, flareWhite * (glowFactor + 0.8), uFlare * 0.75)"), 'shader must mix toward white-hot on flare');
});

test('v0.1.9 auto-orbit: oscillation stays inside the front arc — every node z > 0 at all times', () => {
  assert.equal(ORBIT_AMPLITUDE_DEG, 20);
  assert.equal(ORBIT_ANGULAR_SPEED_RAD_S, 0.06);
  // The offset is a bounded sinusoid: never beyond ±20°, and it
  // actually moves (not a constant).
  let min = Infinity;
  let max = -Infinity;
  for (let t = 0; t <= 210; t += 0.5) {
    const off = (nodeOrbitOffset(t) * 180) / Math.PI;
    min = Math.min(min, off);
    max = Math.max(max, off);
    assert.ok(Math.abs(off) <= ORBIT_AMPLITUDE_DEG + 1e-9, `offset ${off}° exceeds ±${ORBIT_AMPLITUDE_DEG}° at t=${t}s`);
  }
  assert.ok(max > 19 && min < -19, `orbit must actually swing both ways (min ${min}°, max ${max}°)`);
  // Two full periods swept (period ≈ 105 s): every node, at every
  // sampled time, stays in the front arc with z > 0 — so all four
  // labels stay visible at once, and no node ever crosses the sphere.
  for (let t = 0; t <= 210; t += 0.5) {
    for (let i = 0; i < 4; i++) {
      const angle = orbitedNodeAngleDeg(i, t);
      assert.ok(angle >= 15 - 1e-9 && angle <= 165 + 1e-9, `node ${i} angle ${angle}° leaves the front arc at t=${t}s`);
      const p = orbitedNodePosition(i, t, NODE_RING_RADIUS);
      assert.ok(p.z > 0, `node ${i} must stay in front (z > 0), got z=${p.z} at t=${t}s`);
      assert.equal(p.y, 0);
    }
  }
  // The nodes still spread across the view at every time.
  for (const t of [0, 26, 52, 79, 105, 131, 157, 184, 210]) {
    const xs = [0, 1, 2, 3].map((i) => orbitedNodePosition(i, t, NODE_RING_RADIUS).x);
    assert.ok(Math.min(...xs) < -5 && Math.max(...xs) > 5, `nodes must spread across the view at t=${t}s`);
  }
  // The base arc is unchanged (v0.1.8 geometry).
  assert.deepEqual(NODE_ARC_ANGLES_DEG, [35, 70, 110, 145]);
  // The renderer applies the offset as an ABSOLUTE assignment from
  // the scene clock — never an increment, so the arc can never wind
  // around the sphere into a revolution.
  const renderer = read(RENDERER);
  assert.ok(renderer.includes('gatewayGroupRef.current.rotation.y = nodeOrbitOffset(elapsedTime);'), 'ring must take the absolute orbit offset');
  assert.equal(renderer.includes('gatewayGroupRef.current.rotation.y +='), false, 'ring rotation must never accumulate');
});

test('v0.1.9 halo: present in the same particle system, state-colored, breathing with entropy and flare', () => {
  // Opacity/size helpers: bounded, positive, increasing in both inputs.
  for (const entropy of [0, 0.1, 0.4, 0.6, 1]) {
    for (const flare of [0, 0.5, 1]) {
      const o = haloOpacityFor(entropy, flare);
      assert.ok(o >= 0 && o <= 1, `halo opacity ${o} out of [0,1] for entropy=${entropy} flare=${flare}`);
      const s = haloSizeFor(entropy, flare);
      assert.ok(s > 0, `halo size ${s} must be positive`);
    }
  }
  assert.ok(haloOpacityFor(0.6, 0) > haloOpacityFor(0.1, 0), 'halo must brighten with entropy');
  assert.ok(haloOpacityFor(0.1, 1) > haloOpacityFor(0.1, 0), 'halo must brighten on a flare');
  assert.ok(haloSizeFor(0.1, 1) > haloSizeFor(0.1, 0), 'halo must swell on a flare');
  assert.equal(haloOpacityFor(0, 0), 0.55, 'halo must be visible at rest');
  assert.equal(haloOpacityFor(1, 1), 1, 'halo opacity must cap at 1');
  // The halo is built in the particle effect, in the same group as the
  // mode particles (same cleanup, same vertex-color post-processing) —
  // shell radius 5.5–7.0, tagged so the loop can find it.
  const renderer = read(RENDERER);
  assert.ok(renderer.includes('halo.userData.isHalo = true'), 'halo must be tagged');
  assert.ok(renderer.includes('const r = 5.5 + Math.random() * 1.5;'), 'halo must hug the core (shell 5.5–7.0)');
  assert.ok(renderer.includes('haloRef.current = halo;'), 'halo must be reachable from the loop');
  assert.ok(renderer.includes('haloRef.current = null;'), 'halo ref must clear on particle cleanup');
  // State-colored: the loop lerps the halo material color toward the
  // state's visual color — the same color the shader orb shows — and
  // drives opacity/size from the pure helpers.
  assert.ok(renderer.includes('haloMat.color.lerp(haloTarget, 0.1 * dtSim)'), 'halo color must lerp to the state color');
  assert.ok(renderer.includes('haloOpacityFor(entropyValue, flare)'), 'halo opacity must come from the pure helper');
  assert.ok(renderer.includes('haloSizeFor(entropyValue, flare)'), 'halo size must come from the pure helper');
  // The halo color IS the state color: every state's visual color is
  // a distinct hex color the halo takes on (idle cyan, thinking
  // purple, executing green, blocked red — the Phase A vocabulary).
  const states: OrbActivityState[] = ['idle', 'listening', 'thinking', 'planning', 'executing', 'verifying', 'complete', 'blocked'];
  const colors = new Set(states.map((s) => orbVisualForState(s).color));
  assert.equal(colors.size, 8, 'each state must give the halo a distinct color');
  assert.equal(orbVisualForState('idle').color, '#1ab3ff');
  assert.equal(orbVisualForState('executing').color, '#22c55e');
  assert.equal(orbVisualForState('blocked').color, '#ff5a5a');
});

test('v0.1.9: no rotating poetic quotes — the original\'s quotes are not ported as decoration', () => {
  // A quote line would be canned decoration. Nothing in the orb
  // files may introduce rotating-quote machinery. Doc comments that
  // record the deliberate omission are not machinery — strip
  // comment lines before scanning (same approach as the v0.1.8
  // legacy-identifier test).
  const stripComments = (text: string) =>
    text
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && t !== '*/';
      })
      .join('\n');
  for (const rel of ['src/experience/orb/orb-life.ts', 'src/experience/orb/node-layout.ts', 'src/experience/orb/OrbHost.tsx']) {
    const code = stripComments(read(rel));
    assert.equal(code.toLowerCase().includes('quote'), false, `${rel} must not introduce quotes`);
  }
  const renderer = read(RENDERER);
  assert.equal(renderer.includes('quote'), false, 'renderer must not introduce quotes');
});

test('v0.1.9: version bump — package.json and footer read 0.1.9', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '0.1.9');
  assert.ok(read('src/App.tsx').includes('NVK Agent v0.1.9'));
  assert.equal(read('src/App.tsx').includes('NVK Agent v0.1.8'), false);
});
