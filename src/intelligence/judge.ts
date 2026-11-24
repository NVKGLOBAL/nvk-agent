/**
 * NVK Agent — the Judge (MCNA slice 6).
 *
 * The judge reads the CONTROLLER's outputs — confidence + reasons,
 * unknowns, outcome diffs — plus the deterministic rubric results. It
 * does NOT re-grade raw text alone. Until the judge exists, no score
 * is presented as a quality signal; now that it exists, the verdict
 * (pass/fail + reasons + the human-review record) is the quality
 * signal, and it always cites its evidence.
 *
 * Deterministic, LLM-independent, plain code. A second-model judge
 * (via the inference layer) is a later layer, not this slice — the
 * deterministic judge is the ground truth, and a model judge would
 * read this verdict, not replace it.
 */

import type { ConfidenceAssessment } from './metacognition';
import type { UncertaintyReport } from './metacognition';
import type { RubricResult } from './rubrics';

export interface OutcomeDiff {
  /** The predicted outcome shape (from the plan node). */
  predicted: unknown;
  /** The actual outcome shape (from the tool result). */
  actual: unknown;
  /** Whether predicted and actual matched. */
  matched: boolean;
}

export interface JudgeInput {
  /** The controller's confidence assessment (score + reasons). */
  confidence: ConfidenceAssessment;
  /** The controller's uncertainty report (named unknowns). */
  uncertainty: UncertaintyReport;
  /** The per-node predicted-vs-actual diffs (from evaluateOutcome). */
  outcomeDiffs: OutcomeDiff[];
  /** The deterministic rubric results for this case (RSN-01/RSN-02/RT-01). */
  rubrics: RubricResult[];
  /** Whether a cannot-solve verdict was reached (an honest stop). */
  cannotSolve?: boolean;
}

export interface JudgeVerdict {
  passed: boolean;
  /** The quality score (0-1), computed from the controller's outputs + rubrics. */
  score: number;
  /** The evidence for the verdict (every reason cites its input). */
  reasons: string[];
  /** The structured human-review record: what a human should check, with the evidence attached. */
  review: {
    check: string;
    evidence: string;
  }[];
}

export function judge(input: JudgeInput): JudgeVerdict {
  const reasons: string[] = [];
  const review: { check: string; evidence: string }[] = [];
  let score = input.confidence.score;

  // A rubric failure is a hard fail (the rubric is the ground truth
  // for its case). A rubric pass is evidence for the verdict.
  for (const rubric of input.rubrics) {
    if (!rubric.passed) {
      reasons.push(`rubric ${rubric.caseId} FAILED: ${rubric.detail}`);
      review.push({ check: `rubric ${rubric.caseId}`, evidence: rubric.detail });
      score = Math.min(score, 0.3);
    } else {
      reasons.push(`rubric ${rubric.caseId} passed: ${rubric.detail}`);
    }
  }

  // An outcome mismatch (predicted ≠ actual) is a fail unless every
  // diff matched. The controller's evaluateOutcome is the source.
  const mismatches = input.outcomeDiffs.filter((d) => !d.matched);
  if (mismatches.length > 0) {
    reasons.push(`${mismatches.length} outcome diff(s) did not match the predicted effect`);
    review.push({
      check: 'outcome diffs',
      evidence: `${mismatches.length} of ${input.outcomeDiffs.length} node(s) mismatched (predicted vs actual)`,
    });
    score = Math.min(score, 0.4);
  } else if (input.outcomeDiffs.length > 0) {
    reasons.push(`all ${input.outcomeDiffs.length} outcome diff(s) matched the predicted effect`);
  }

  // Named unknowns lower the score (they are evidence, not a guess).
  // A run with unknowns cannot claim full quality.
  if (input.uncertainty.unknowns.length > 0) {
    reasons.push(`${input.uncertainty.unknowns.length} unknown(s): ${input.uncertainty.unknowns.join('; ')}`);
    review.push({ check: 'unknowns', evidence: input.uncertainty.unknowns.join('; ') });
    score = Math.min(score, 0.6);
  }

  // A cannot-solve verdict is an honest stop, not a failure — but it is
  // not a pass either (the task was not completed). It scores neutral.
  if (input.cannotSolve === true) {
    reasons.push('cannot-solve: the run stopped honestly (the task was not completed)');
    review.push({ check: 'cannot-solve', evidence: 'the run stopped honestly instead of fabricating an answer' });
    score = Math.min(score, 0.5);
  }

  // The confidence score is the controller's, not the judge's invention.
  reasons.push(`controller confidence ${input.confidence.score}: ${input.confidence.reasons.join('; ')}`);

  score = Math.min(1, Math.max(0, Math.round(score * 100) / 100));
  // Pass requires: no rubric failure, no outcome mismatch, and a
  // confidence at or above the neutral baseline (0.5).
  const passed =
    input.rubrics.every((r) => r.passed) &&
    mismatches.length === 0 &&
    score >= 0.5 &&
    input.cannotSolve !== true;

  if (passed) {
    reasons.push('verdict: PASS — no rubric failure, no outcome mismatch, confidence at or above baseline');
  } else {
    reasons.push('verdict: FAIL — see the reasons above');
  }

  return { passed, score, reasons, review };
}
