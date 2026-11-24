/**
 * NVK Agent — metacognitive controller (MCNA slice 1).
 *
 * Deterministic, LLM-independent. It never generates text, never calls a
 * model, never invents a number. Every output cites its inputs:
 * confidence is computed ONLY from verifiable signals, strategy selection
 * records which rule fired, and learning is stored ONLY when the outcome's
 * evidence re-verifies. A bare number without reasons is a defect.
 *
 * Architecture: ~/workspace/nvk-unified/mcna-super-agent-architecture-2026-11-23.md §5.
 * Wiring: the pipeline runs the controller after the capability/permission
 * stages (strategy selection) and after execution/verification (outcome
 * evaluation + learning gate). It does not reorder stages and does not
 * change the generation path.
 */
import { memoryStore } from './memory';
import { reverifyEvidence } from '../sovereign/evidence';

/* ------------------------------------------------------------------ */
/* assessConfidence                                                    */
/* ------------------------------------------------------------------ */

/**
 * Verifiable signals only. Each signal that moves the score must appear
 * in `reasons` by name. The score is a bounded sum over the signals
 * (base 0.5 = neutral, no verifiable signals either way); it is never a
 * constant — different signal sets produce different scores.
 */
export interface ConfidenceSignals {
  /** A tool ran and returned a result. */
  toolResultPresent?: boolean;
  /** That tool result's hash re-verified against its stored payload. */
  toolResultHashVerified?: boolean;
  /** Memory retrieval found a matching record. */
  retrievalHit?: boolean;
  /** Memory retrieval found nothing for the query. */
  retrievalMiss?: boolean;
  /** Generation stopped at the token cap (output may be incomplete). */
  generationTruncated?: boolean;
  /** A permission decision denied the requested action. */
  permissionDenied?: boolean;
  /** A prior run of the same task type succeeded with verified evidence. */
  priorVerifiedSuccess?: boolean;
}

export interface ConfidenceAssessment {
  score: number;
  reasons: string[];
}

const CONFIDENCE_WEIGHTS: Array<{
  key: keyof ConfidenceSignals;
  weight: number;
  reason: string;
}> = [
  { key: 'toolResultPresent', weight: 0.15, reason: 'tool result present (+0.15)' },
  { key: 'toolResultHashVerified', weight: 0.15, reason: 'tool result hash-verified (+0.15)' },
  { key: 'retrievalHit', weight: 0.1, reason: 'memory retrieval hit (+0.10)' },
  { key: 'retrievalMiss', weight: -0.1, reason: 'memory retrieval miss (−0.10)' },
  { key: 'generationTruncated', weight: -0.2, reason: 'generation truncated at token cap (−0.20)' },
  { key: 'permissionDenied', weight: -0.25, reason: 'permission denied (−0.25)' },
  { key: 'priorVerifiedSuccess', weight: 0.15, reason: 'prior verified success on same task type (+0.15)' },
];

export function assessConfidence(signals: ConfidenceSignals): ConfidenceAssessment {
  let score = 0.5;
  const reasons: string[] = [];
  for (const { key, weight, reason } of CONFIDENCE_WEIGHTS) {
    if (signals[key] === true) {
      score += weight;
      reasons.push(reason);
    }
  }
  score = Math.min(1, Math.max(0, score));
  score = Math.round(score * 100) / 100;
  if (reasons.length === 0) {
    reasons.push('no verifiable signals — neutral baseline (0.50)');
  }
  return { score, reasons };
}

/* ------------------------------------------------------------------ */
/* detectUncertainty                                                   */
/* ------------------------------------------------------------------ */

export interface UncertaintyState {
  /** Named pieces of information that are missing. */
  missingInformation?: string[];
  /** Tools that were expected to run but did not. */
  toolNotRun?: string[];
  /** Memory lookups that found nothing. */
  memoryNotFound?: string[];
  /** The model could not answer (e.g. demo mode, no model loaded). */
  modelCouldNotAnswer?: boolean;
  /** Why the model could not answer, when known. */
  modelCouldNotAnswerReason?: string;
}

export interface UncertaintyReport {
  unknowns: string[];
}

export function detectUncertainty(state: UncertaintyState): UncertaintyReport {
  const unknowns: string[] = [];
  for (const item of state.missingInformation ?? []) {
    unknowns.push(`missing information: ${item}`);
  }
  for (const tool of state.toolNotRun ?? []) {
    unknowns.push(`tool not run: ${tool}`);
  }
  for (const query of state.memoryNotFound ?? []) {
    unknowns.push(`memory not found: ${query}`);
  }
  if (state.modelCouldNotAnswer === true) {
    unknowns.push(
      `model could not answer${state.modelCouldNotAnswerReason ? `: ${state.modelCouldNotAnswerReason}` : ''}`,
    );
  }
  return { unknowns };
}

/* ------------------------------------------------------------------ */
/* selectStrategy                                                      */
/* ------------------------------------------------------------------ */

export type Strategy = 'act' | 'investigate' | 'simulate' | 'ask';

export interface StrategyState {
  /** A tool result is in hand (verified when hashVerified is true). */
  hasToolResult?: boolean;
  toolResultVerified?: boolean;
  /** A safe read-only tool exists that could supply the missing result. */
  safeReadOnlyToolAvailable?: boolean;
  /** The plan proposes an action that changes state. */
  proposedStateChange?: boolean;
  /** Evidence exists for the proposed state change. */
  hasEvidenceForChange?: boolean;
  /** A simulation of the state change is available. */
  simulationAvailable?: boolean;
  /** A tool result contradicts the plan. */
  contradiction?: boolean;
  /** What the contradiction is, when known. */
  contradictionDetail?: string;
  /** cannotSolve() already fired for this state. */
  cannotSolve?: boolean;
}

export interface StrategySelection {
  strategy: Strategy;
  /** The deterministic rule that fired — always recorded, never a bare choice. */
  rule: string;
}

/**
 * Deterministic rules over state, evaluated in a fixed rule order — the
 * order is the priority of the rules, not a fallback sequence: exactly
 * one rule fires, and its name is returned with the strategy. No
 * coin-flips, no randomness, no silent `act`.
 */
export function selectStrategy(state: StrategyState): StrategySelection {
  if (state.contradiction === true) {
    return {
      strategy: 'ask',
      rule: 'R-CONTRADICTION: tool result contradicts the plan — ask the owner before acting',
    };
  }
  if (state.cannotSolve === true) {
    return {
      strategy: 'ask',
      rule: 'R-CANNOT-SOLVE: no tool, memory, or safe strategy covers this — ask the owner',
    };
  }
  if (state.proposedStateChange === true && state.hasEvidenceForChange !== true) {
    if (state.simulationAvailable === true) {
      return {
        strategy: 'simulate',
        rule: 'R-STATE-CHANGE-NO-EVIDENCE: state change proposed with no evidence — simulate first',
      };
    }
    return {
      strategy: 'ask',
      rule: 'R-STATE-CHANGE-NO-EVIDENCE-NO-SIMULATION: state change proposed with no evidence and no simulation — ask, never silently act',
    };
  }
  if (state.hasToolResult !== true && state.safeReadOnlyToolAvailable === true) {
    return {
      strategy: 'investigate',
      rule: 'R-NO-TOOL-RESULT: no tool result and a safe read-only tool exists — investigate',
    };
  }
  if (state.hasToolResult === true && state.toolResultVerified === true) {
    return {
      strategy: 'act',
      rule: 'R-VERIFIED-RESULT: verified tool result in hand — act',
    };
  }
  if (state.hasToolResult === true && state.toolResultVerified !== true) {
    return {
      strategy: 'investigate',
      rule: 'R-UNVERIFIED-RESULT: tool result present but not hash-verified — investigate before acting',
    };
  }
  return {
    strategy: 'ask',
    rule: 'R-NO-BASIS: no tool result, no safe tool, no evidence — nothing to act on, ask',
  };
}

/* ------------------------------------------------------------------ */
/* evaluateOutcome                                                     */
/* ------------------------------------------------------------------ */

export interface OutcomeEvaluation {
  matched: boolean;
  /** Human-readable description of the mismatch; null when matched. */
  diff: string | null;
  /** Whether the actual outcome was verified (hash match / tool success). */
  verified: boolean;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 200));
  try {
    return JSON.stringify(value)?.slice(0, 200) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Compares what was predicted against what the tool/evidence actually
 * returned. A mismatch is detected here — it produces an error record
 * (the diff), never a silent re-run of the same failed step.
 *
 * `verification` reports how the actual was checked: hashVerified means
 * the actual's hash re-verified; toolSuccess means the tool reported
 * success. Without either, verified is false even when matched — a match
 * against unverified evidence is not knowledge.
 */
export function evaluateOutcome(
  prediction: unknown,
  actual: unknown,
  verification?: { hashVerified?: boolean; toolSuccess?: boolean },
): OutcomeEvaluation {
  const matched = JSON.stringify(prediction) === JSON.stringify(actual);
  const verified =
    verification?.hashVerified === true || verification?.toolSuccess === true;
  if (matched) {
    return { matched: true, diff: null, verified };
  }
  return {
    matched: false,
    diff: `predicted ${describeValue(prediction)} but actual was ${describeValue(actual)}`,
    verified,
  };
}

/* ------------------------------------------------------------------ */
/* recordVerifiedOutcome — the learning-control gate                    */
/* ------------------------------------------------------------------ */

export type VerifiedEvidenceKind = 'hash-match' | 'tool-success' | 'user-confirmation';

export interface OutcomeEvidence {
  kind: VerifiedEvidenceKind;
  /** The caller's claim that the evidence verified. */
  verified: boolean;
  /** Evidence-record id, when kind is hash-match: re-verified here. */
  evidenceId?: string;
}

export interface RecordedOutcome {
  taskType: string;
  prediction: unknown;
  actual: unknown;
  evidence: OutcomeEvidence;
  at: number;
}

export interface RecordVerifiedOutcomeResult {
  /** 'knowledge' only when the evidence re-verified; otherwise 'attempt'. */
  storedAs: 'knowledge' | 'attempt';
  /** Why the outcome was stored as knowledge or as an attempt. */
  reason: string;
}

const LEARNING_KEY = 'metacognition-learning';
const ATTEMPTS_KEY = 'metacognition-attempts';
const MAX_STORED = 200;

/** In-memory mirror of the stored learning, for synchronous inspection. */
const verifiedLearning: RecordedOutcome[] = [];
const recordedAttempts: RecordedOutcome[] = [];

export function getVerifiedLearning(): RecordedOutcome[] {
  return [...verifiedLearning];
}

export function getRecordedAttempts(): RecordedOutcome[] {
  return [...recordedAttempts];
}

/** Test-only reset of the in-memory mirrors (the persisted keys are untouched). */
export function resetMetacognitionLearning(): void {
  verifiedLearning.length = 0;
  recordedAttempts.length = 0;
}

export async function recordVerifiedOutcome(
  outcome: Omit<RecordedOutcome, 'at'>,
): Promise<RecordVerifiedOutcomeResult> {
  const record: RecordedOutcome = { ...outcome, at: Date.now() };
  let verified = outcome.evidence.verified === true;
  let reason = '';

  // Hash-match claims with an evidence id are re-verified here against
  // the store — a claimed hash match that fails re-verification is not
  // learning, it is a failed attempt.
  if (outcome.evidence.kind === 'hash-match' && outcome.evidence.evidenceId) {
    const check = await reverifyEvidence(outcome.evidence.evidenceId);
    verified = check.found && check.pass;
    reason = check.pass
      ? `evidence ${outcome.evidence.evidenceId} re-verified (hash match)`
      : `evidence ${outcome.evidence.evidenceId} failed re-verification: ${check.detail}`;
  } else if (outcome.evidence.kind === 'hash-match') {
    reason = 'hash-match claimed without an evidence id to re-verify';
    verified = outcome.evidence.verified === true;
  } else if (outcome.evidence.kind === 'tool-success') {
    reason = 'tool reported success';
  } else {
    reason = 'user confirmed the outcome';
  }

  if (verified) {
    verifiedLearning.push(record);
    const stored = (await memoryStore.get<RecordedOutcome[]>(LEARNING_KEY)) ?? [];
    stored.push(record);
    await memoryStore.set(LEARNING_KEY, stored.slice(-MAX_STORED));
    return { storedAs: 'knowledge', reason };
  }
  recordedAttempts.push(record);
  const stored = (await memoryStore.get<RecordedOutcome[]>(ATTEMPTS_KEY)) ?? [];
  stored.push(record);
  await memoryStore.set(ATTEMPTS_KEY, stored.slice(-MAX_STORED));
  return {
    storedAs: 'attempt',
    reason: `not stored as knowledge: ${reason || 'evidence did not verify'}`,
  };
}

/* ------------------------------------------------------------------ */
/* cannotSolve                                                         */
/* ------------------------------------------------------------------ */

export interface CannotSolveState {
  /** Tools that could act on this task (empty = none). */
  toolsAvailable?: string[];
  /** Memory already covers this task. */
  memoryCovers?: boolean;
  /** A safe strategy exists for this task. */
  safeStrategyExists?: boolean;
  /** Named information that would be needed. */
  missingInformation?: string[];
  /** A tool that would change the verdict if it existed. */
  missingTool?: string;
  /** A permission that would change the verdict if granted. */
  missingPermission?: string;
}

export interface CannotSolveVerdict {
  cannotSolve: boolean;
  /** Reasons, each naming what is missing and what would change the verdict. */
  reasons: string[];
}

/**
 * Fires BEFORE resources are spent: a pure function, no model call, no
 * tool call, no side effects. It says what would change the verdict so
 * the owner (or a later slice) knows exactly what is missing.
 */
export function cannotSolve(state: CannotSolveState): CannotSolveVerdict {
  const reasons: string[] = [];
  const toolsAvailable = state.toolsAvailable ?? [];
  if (toolsAvailable.length === 0) {
    reasons.push(
      `no tool can act on this task (available tools: none) — would change: register a tool${state.missingTool ? ` (${state.missingTool})` : ''} that can act on it`,
    );
  }
  if (state.memoryCovers !== true) {
    reasons.push(
      'no memory covers this task — would change: a stored verified outcome for this task type',
    );
  }
  if (state.safeStrategyExists !== true) {
    reasons.push(
      'no safe strategy exists — would change: a read-only investigation path or a simulation for the proposed action',
    );
  }
  for (const item of state.missingInformation ?? []) {
    reasons.push(`missing information: ${item} — would change: provide it`);
  }
  if (state.missingPermission) {
    reasons.push(
      `missing permission: ${state.missingPermission} — would change: owner approval for it`,
    );
  }
  return { cannotSolve: reasons.length > 0, reasons };
}
