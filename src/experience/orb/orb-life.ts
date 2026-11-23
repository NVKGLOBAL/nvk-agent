/**
 * NVK Agent — orb life (v0.1.9).
 *
 * The WebSim original (NvK's own Codex Orb System,
 * https://websim.com/@grandnectar29356979/web3d-codex-orb-system-3)
 * is a purely visual ambient sim: a speckled cyan sphere in a
 * green/cyan particle halo that slowly pulses and periodically FLARES
 * white-hot, with a ring of nodes that drifts/orbits on its own.
 * It has no function — clicks do nothing, nodes open nothing.
 *
 * This module is the HONEST translation of that life into our orb:
 * the function stays (nodes open real panels, the orb shows real
 * pipeline states — Phase A), and only the life is ported:
 *
 * 1. FLARE — fires on a REAL pipeline completion only: a 'result'
 *    stage event (the one transition that maps the orb to
 *    'complete'). The flare is an event edge, not a state: the host
 *    counts completions, the renderer turns each edge into an
 *    intensity of 1.0, and it decays exponentially in real seconds.
 *    The decay is a frame-delta function in the animation loop, like
 *    the existing click-impulse spring — there is no timer anywhere
 *    on this path, and the orb STATE never moves on decay.
 * 2. AUTO-ORBIT — the node ring drifts gently inside the v0.1.8
 *    front arc (see node-layout.ts): a slow sinusoidal oscillation,
 *    never a revolution. The original's full revolution hides panels
 *    behind the sphere and washes out their text — we do not copy
 *    that part. All four labels stay visible at once.
 * 3. HALO — a green/cyan particle shell hugging the core, built in
 *    the same particle effect as the mode particles (same group,
 *    same cleanup, same vertex-color post-processing — an added
 *    layer of the one particle system, not a second system). Its
 *    color is the REAL orb state (the same color the shader orb
 *    shows), its opacity/size breathe with entropy and brighten on
 *    a flare.
 *
 * The original's rotating poetic quotes are NOT ported: a quote line
 * would be canned decoration. If a line of text ever appears on the
 * orb it must be a real status line from the pipeline.
 *
 * Everything in this file is pure and unit-tested. The renderer
 * (CodexOrbSystem.tsx) applies these values; it never invents them.
 */
import { orbStateForStageEvent } from './orb-state';
import type { StageEvent } from '../../intelligence/pipeline';

/** Flare intensity halves every 0.8 s of real time after the event. */
export const FLARE_HALF_LIFE_S = 0.8;

/** Flare intensity is 0..1; a fresh completion sets exactly 1.0. */
export const FLARE_MAX_INTENSITY = 1.0;

/**
 * Exponential decay of the flare intensity over real seconds.
 * Pure: no clock, no timer — the caller passes the frame delta.
 * Returns 0 once the intensity is negligible (< 0.001), never
 * negative, never above 1.0. A non-positive delta leaves the
 * intensity unchanged (no time passed).
 */
export function flareIntensityAfter(intensity: number, dtSeconds: number): number {
  if (!(intensity > 0)) return 0;
  const capped = Math.min(FLARE_MAX_INTENSITY, intensity);
  if (!(dtSeconds > 0)) return capped;
  const next = capped * Math.pow(0.5, dtSeconds / FLARE_HALF_LIFE_S);
  return next < 0.001 ? 0 : next;
}

/**
 * The ONLY event that fires the flare: a stage event whose mapped
 * orb state is 'complete' — i.e. a 'result' stage, a real pipeline
 * completion. Every other stage (including a DENIED permission,
 * which maps to 'blocked') does not flare.
 */
export function shouldFlareOnStageEvent(event: StageEvent): boolean {
  return orbStateForStageEvent(event) === 'complete';
}

/** Clamp helper (local — no other module needs it). */
function clamp01(v: number): number {
  if (!(v >= 0)) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Halo opacity: visible at rest (0.55), brighter as the pipeline
 * gets more agitated (entropy), brightest on a flare. Always in
 * [0, 1] for entropy/flare in [0, 1].
 */
export function haloOpacityFor(entropy: number, flare: number): number {
  return Math.min(1, 0.55 + clamp01(entropy) * 0.3 + clamp01(flare) * 0.25);
}

/**
 * Halo particle size (world units): grows slightly with entropy and
 * swells on a flare. Always positive.
 */
export function haloSizeFor(entropy: number, flare: number): number {
  return 0.06 + clamp01(entropy) * 0.03 + clamp01(flare) * 0.04;
}
