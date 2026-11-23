/**
 * NVK Agent — orb activity states. THE state contract (Phase A, v0.1.5).
 *
 * Unification Directive §7: the orb must represent REAL activity states —
 * never decorative animation pretending to be intelligence. The ONLY input
 * to this mapping is the pipeline's real stage events. A stage that has not
 * happened cannot move the orb.
 *
 * STATE DISCIPLINE (adopted 2026-11-22, Phase A of the orb re-engineering):
 * - This file is the ONE orb-state vocabulary: exactly 8 states
 *   (idle/listening/thinking/planning/executing/verifying/complete/blocked).
 * - The OS repo's competing vocabularies are NOT adopted here: neither its
 *   7-state orb-state type nor the 11-state event vocabulary in its
 *   runtime events module. Three vocabularies for the same idea is a merge
 *   hazard; Phase B must not introduce either of them.
 * - No timer may move the orb. The 4-second return-to-idle timeout that
 *   lived in OrbHost (v0.1.4) was removed in Phase A: the last real state
 *   stands until the next real stage event arrives. A state with no
 *   pipeline event behind it is not a state.
 * - No scripted sequence may move the orb. The OS repo's scripted
 *   state-sequence data (built and never executed) and its canned
 *   keyword-answer fallback do not exist in this codebase and must never
 *   be introduced. See docs/PHASE-A-STATE-DISCIPLINE.md for the audit.
 * - The visual input (color / entropy / pulse) is derived from the OS
 *   repo's orb animation loop (see orbVisualForState) and is applied only
 *   through real stage events. A state with no visual mapping is a bug,
 *   not a default.
 */
import type { PipelineStage, StageEvent } from '../../intelligence/pipeline';

export type OrbActivityState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'complete'
  | 'blocked';

/** The full vocabulary, in pipeline order. Nothing else is an orb state. */
export const ORB_STATES: readonly OrbActivityState[] = [
  'idle',
  'listening',
  'thinking',
  'planning',
  'executing',
  'verifying',
  'complete',
  'blocked',
];

export function orbStateForStage(stage: PipelineStage): OrbActivityState {
  switch (stage) {
    case 'input':
      return 'listening';
    case 'intent':
    case 'context':
    case 'reasoning':
      return 'thinking';
    case 'planning':
    case 'capability':
      return 'planning';
    case 'permission':
    case 'execution':
      return 'executing';
    case 'verification':
    case 'evidence':
      return 'verifying';
    case 'result':
      return 'complete';
    default:
      return 'idle';
  }
}

/**
 * The event-level mapping the orb host uses. A denied permission is the
 * one way the pipeline reports a stop, and it must show as 'blocked' —
 * the stage alone ('permission') would otherwise read as 'executing'
 * while the run is in fact halted. The transition still cites a real
 * stage event (the permission event, with its DENIED note); it is never
 * produced by a timer or a script.
 */
export function orbStateForStageEvent(event: StageEvent): OrbActivityState {
  if (event.stage === 'permission' && (event.note ?? '').startsWith('DENIED')) {
    return 'blocked';
  }
  return orbStateForStage(event.stage);
}

/**
 * Visual input for the orb renderer, per state.
 *
 * Values adapted from the OS repo's orb animation loop (discovery §2):
 * listening blue; thinking purple + entropy 0.4 + 2.2x pulse; acting
 * green + entropy 0.25; error red + entropy 0.6; default cyan. The
 * Agent's 8 states refine that mapping: planning is a lighter purple
 * between thinking and executing; verifying is teal; complete is the
 * emerald the footer already used; blocked takes the error red +
 * entropy 0.6. The idle/default color is the shader's own hardcoded
 * cyan (vec3 0.1, 0.7, 1.0), so the orb looks identical at rest.
 *
 * Deliberately absent: a "discovery" gold. The OS repo's gold state has
 * no pipeline event behind it in this Agent — no discovery stage exists
 * — so there is nothing honest to paint gold. Add it only when a real
 * event produces it, never as decoration.
 */
export interface OrbVisualInput {
  /** Hex color the orb (and the footer status dot) renders in this state. */
  color: string;
  /** 0..1 — how turbulent the plasma reads. Higher = more agitated. */
  entropy: number;
  /** Pulse-speed multiplier on the inner-core pulse. 1.0 = resting. */
  pulse: number;
}

export function orbVisualForState(state: OrbActivityState): OrbVisualInput {
  switch (state) {
    case 'idle':
      return { color: '#1ab3ff', entropy: 0.1, pulse: 1.0 };
    case 'listening':
      return { color: '#3b82f6', entropy: 0.15, pulse: 1.2 };
    case 'thinking':
      return { color: '#a855f7', entropy: 0.4, pulse: 2.2 };
    case 'planning':
      return { color: '#c084fc', entropy: 0.35, pulse: 1.8 };
    case 'executing':
      return { color: '#22c55e', entropy: 0.25, pulse: 1.5 };
    case 'verifying':
      return { color: '#2dd4bf', entropy: 0.2, pulse: 1.3 };
    case 'complete':
      return { color: '#3dff9e', entropy: 0.1, pulse: 1.0 };
    case 'blocked':
      return { color: '#ff5a5a', entropy: 0.6, pulse: 0.8 };
  }
}

export function orbStateLabel(state: OrbActivityState): string {
  switch (state) {
    case 'idle':
      return 'Idle — waiting';
    case 'listening':
      return 'Listening';
    case 'thinking':
      return 'Thinking';
    case 'planning':
      return 'Planning';
    case 'executing':
      return 'Executing';
    case 'verifying':
      return 'Verifying';
    case 'complete':
      return 'Complete';
    case 'blocked':
      return 'Blocked — needs your approval';
  }
}
