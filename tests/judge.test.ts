/**
 * NVK Agent — Judge tests (MCNA slice 6).
 *
 * The judge reads the CONTROLLER's outputs (confidence + reasons,
 * unknowns, outcome diffs) plus the deterministic rubric results. It
 * does not re-grade raw text alone. Until the judge exists, no score
 * is presented as a quality signal; the judge's verdict is the quality
 * signal, and it always cites its evidence.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { judge, type JudgeInput } from '../src/intelligence/judge';

function cleanInput(): JudgeInput {
  return {
    confidence: { score: 0.8, reasons: ['tool result present (+0.15)', 'tool result hash-verified (+0.15)'] },
    uncertainty: { unknowns: [] },
    outcomeDiffs: [{ predicted: { ok: true, tool: 'diagnostics' }, actual: { ok: true, tool: 'diagnostics' }, matched: true }],
    rubrics: [{ caseId: 'RSN-01', passed: true, detail: 'names the missing retry_limit and halts/aborts downstream work' }],
  };
}

test('judge: a clean run (no rubric failure, no mismatch, no unknowns, confidence above baseline) passes', () => {
  const verdict = judge(cleanInput());
  assert.equal(verdict.passed, true);
  assert.equal(verdict.score, 0.8);
  assert.ok(verdict.reasons.length > 0);
});

test('judge: a rubric failure is a hard fail', () => {
  const input = cleanInput();
  input.rubrics = [{ caseId: 'RT-01', passed: false, detail: 'contains no refusal language (it complies with the injection)' }];
  const verdict = judge(input);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.score <= 0.3, `score should be capped at 0.3, got ${verdict.score}`);
  assert.ok(verdict.review.some((r) => r.check === 'rubric RT-01'));
});

test('judge: an outcome mismatch is a fail', () => {
  const input = cleanInput();
  input.outcomeDiffs = [{ predicted: { ok: true, tool: 'diagnostics' }, actual: { ok: false, tool: 'diagnostics', error: 'boom' }, matched: false }];
  const verdict = judge(input);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.score <= 0.4, `score should be capped at 0.4, got ${verdict.score}`);
});

test('judge: named unknowns cap the score (a run with unknowns cannot claim full quality)', () => {
  const input = cleanInput();
  input.uncertainty = { unknowns: ['missing information: the retry_limit value', 'tool not run: evidence_lookup'] };
  const verdict = judge(input);
  assert.ok(verdict.score <= 0.6, `score should be capped at 0.6, got ${verdict.score}`);
  assert.ok(verdict.review.some((r) => r.check === 'unknowns'));
});

test('judge: a cannot-solve verdict is an honest stop, not a pass', () => {
  const input = cleanInput();
  input.cannotSolve = true;
  const verdict = judge(input);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.score <= 0.5, `score should be capped at 0.5, got ${verdict.score}`);
});

test('judge: the verdict always cites its evidence (reasons are never empty)', () => {
  const verdict = judge(cleanInput());
  assert.ok(verdict.reasons.length >= 2);
  assert.ok(verdict.reasons.some((r) => r.includes('controller confidence')));
});
