/**
 * NVK Agent — orb activity states.
 *
 * Unification Directive §7: the orb must represent REAL activity states —
 * never decorative animation pretending to be intelligence. The ONLY input
 * to this mapping is the pipeline's real stage events. A stage that has not
 * happened cannot move the orb.
 */
import type { PipelineStage } from '../../intelligence/pipeline';

export type OrbActivityState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'complete'
  | 'blocked';

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
