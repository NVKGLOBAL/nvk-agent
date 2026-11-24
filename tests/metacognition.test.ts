/**
 * NVK Agent — metacognitive controller tests (MCNA slice 1).
 *
 * Run: npm test
 *
 * Architecture §5: the controller is deterministic and LLM-independent.
 * Confidence is computed ONLY from verifiable signals (a bare number
 * without reasons is a defect, and the score must never be a constant);
 * strategy selection is deterministic for the same state and records
 * which rule fired; learning is stored ONLY when the outcome's evidence
 * re-verifies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessConfidence,
  detectUncertainty,
  selectStrategy,
  evaluateOutcome,
  recordVerifiedOutcome,
  cannotSolve,
  getVerifiedLearning,
  getRecordedAttempts,
  resetMetacognitionLearning,
} from '../src/intelligence/metacognition';
import { storeEvidence } from '../src/sovereign/evidence';
import { memoryStore } from '../src/intelligence/memory';
import { runPipeline } from '../src/intelligence/pipeline';
import { settingsStore } from '../src/intelligence/settings';

/* ------------------------------------------------------------------ */
/* assessConfidence                                                    */
/* ------------------------------------------------------------------ */

test('confidence: varies with signals and is never a bare constant', () => {
  const none = assessConfidence({});
  const good = assessConfidence({
    toolResultPresent: true,
    toolResultHashVerified: true,
    retrievalHit: true,
    priorVerifiedSuccess: true,
  });
  const bad = assessConfidence({
    retrievalMiss: true,
    generationTruncated: true,
    permissionDenied: true,
  });
  assert.notEqual(good.score, none.score, 'positive signals must raise the score');
  assert.notEqual(bad.score, none.score, 'negative signals must lower the score');
  assert.notEqual(good.score, bad.score);
  assert.ok(good.score >= 0 && good.score <= 1, `score out of bounds: ${good.score}`);
  assert.ok(bad.score >= 0 && bad.score <= 1, `score out of bounds: ${bad.score}`);
  // Every result carries reasons — a bare number is a defect.
  assert.ok(none.reasons.length > 0);
  assert.ok(good.reasons.length > 0);
  assert.ok(bad.reasons.length > 0);
});

test('confidence: reasons name every signal that moved the score', () => {
  const { score, reasons } = assessConfidence({
    toolResultPresent: true,
    toolResultHashVerified: true,
    generationTruncated: true,
  });
  // 0.5 + 0.15 + 0.15 − 0.20 = 0.60
  assert.equal(score, 0.6);
  const joined = reasons.join(' ');
  assert.match(joined, /tool result present/);
  assert.match(joined, /hash-verified/);
  assert.match(joined, /truncated/);
  // A signal that did NOT occur is not named as moving the score.
  assert.doesNotMatch(joined, /permission denied/);
  assert.doesNotMatch(joined, /retrieval miss/);
});

test('confidence: no signals is an explicit neutral baseline, not a fake measurement', () => {
  const { score, reasons } = assessConfidence({});
  assert.equal(score, 0.5);
  assert.match(reasons.join(' '), /no verifiable signals/);
});

/* ------------------------------------------------------------------ */
/* detectUncertainty                                                   */
/* ------------------------------------------------------------------ */

test('uncertainty: names what is missing', () => {
  const { unknowns } = detectUncertainty({
    missingInformation: ['the owner’s approval for publishing'],
    toolNotRun: ['diagnostics'],
    memoryNotFound: ['prior turns for this conversation'],
    modelCouldNotAnswer: true,
    modelCouldNotAnswerReason: 'no model loaded — demo mode',
  });
  assert.equal(unknowns.length, 4);
  assert.ok(unknowns.some((u) => u.includes('missing information: the owner’s approval')));
  assert.ok(unknowns.some((u) => u.includes('tool not run: diagnostics')));
  assert.ok(unknowns.some((u) => u.includes('memory not found: prior turns')));
  assert.ok(unknowns.some((u) => u.includes('model could not answer: no model loaded')));
});

test('uncertainty: nothing missing is an empty list, not an invented unknown', () => {
  assert.deepEqual(detectUncertainty({}).unknowns, []);
});

/* ------------------------------------------------------------------ */
/* selectStrategy                                                      */
/* ------------------------------------------------------------------ */

test('strategy: deterministic for the same state, and the rule is recorded', () => {
  const state = { hasToolResult: false, safeReadOnlyToolAvailable: true };
  const first = selectStrategy(state);
  const second = selectStrategy(state);
  assert.deepEqual(first, second);
  assert.equal(first.strategy, 'investigate');
  assert.match(first.rule, /^R-NO-TOOL-RESULT/);
});

test('strategy: a contradiction asks, never silently acts', () => {
  const { strategy, rule } = selectStrategy({
    hasToolResult: true,
    toolResultVerified: true,
    contradiction: true,
    contradictionDetail: 'tool says 4, plan says 5',
  });
  assert.equal(strategy, 'ask');
  assert.match(rule, /^R-CONTRADICTION/);
});

test('strategy: a state change with no evidence simulates when possible, asks when not', () => {
  const withSim = selectStrategy({
    proposedStateChange: true,
    hasEvidenceForChange: false,
    simulationAvailable: true,
  });
  assert.equal(withSim.strategy, 'simulate');
  assert.match(withSim.rule, /^R-STATE-CHANGE-NO-EVIDENCE/);

  const withoutSim = selectStrategy({
    proposedStateChange: true,
    hasEvidenceForChange: false,
    simulationAvailable: false,
  });
  assert.equal(withoutSim.strategy, 'ask');
  assert.match(withoutSim.rule, /NO-SIMULATION/);
});

test('strategy: a verified tool result acts; an unverified one investigates', () => {
  assert.equal(
    selectStrategy({ hasToolResult: true, toolResultVerified: true }).strategy,
    'act',
  );
  const unverified = selectStrategy({ hasToolResult: true, toolResultVerified: false });
  assert.equal(unverified.strategy, 'investigate');
  assert.match(unverified.rule, /^R-UNVERIFIED-RESULT/);
});

test('strategy: no basis at all asks — there is no silent default act', () => {
  const { strategy, rule } = selectStrategy({});
  assert.equal(strategy, 'ask');
  assert.match(rule, /^R-NO-BASIS/);
});

/* ------------------------------------------------------------------ */
/* evaluateOutcome                                                     */
/* ------------------------------------------------------------------ */

test('outcome: a matching prediction/actual matches; verified only with verification', () => {
  const matched = evaluateOutcome(
    { blocked: false, answerGenerated: true },
    { blocked: false, answerGenerated: true },
    { hashVerified: true },
  );
  assert.equal(matched.matched, true);
  assert.equal(matched.diff, null);
  assert.equal(matched.verified, true);

  // Same match, no verification: matched but NOT verified — a match
  // against unverified evidence is not knowledge.
  const unverified = evaluateOutcome(
    { blocked: false, answerGenerated: true },
    { blocked: false, answerGenerated: true },
  );
  assert.equal(unverified.matched, true);
  assert.equal(unverified.verified, false);
});

test('outcome: a prediction/actual mismatch is detected and described', () => {
  const result = evaluateOutcome(
    { blocked: false, answerGenerated: true, evidenceStored: true },
    { blocked: true, answerGenerated: false, evidenceStored: false },
    { hashVerified: false },
  );
  assert.equal(result.matched, false);
  assert.ok(result.diff !== null && result.diff.includes('predicted'));
  assert.ok(result.diff.includes('actual was'));
  assert.equal(result.verified, false);
});

/* ------------------------------------------------------------------ */
/* cannotSolve                                                         */
/* ------------------------------------------------------------------ */

test('cannotSolve: fires with reasons before resources are spent', () => {
  const verdict = cannotSolve({
    toolsAvailable: [],
    memoryCovers: false,
    safeStrategyExists: false,
    missingInformation: ['which panel to open'],
    missingTool: 'panel_control execution (no bus)',
  });
  assert.equal(verdict.cannotSolve, true);
  assert.ok(verdict.reasons.length >= 3);
  const joined = verdict.reasons.join(' ');
  assert.match(joined, /no tool can act/);
  assert.match(joined, /no memory covers/);
  assert.match(joined, /no safe strategy exists/);
  assert.match(joined, /missing information: which panel to open/);
  // Every reason says what would change the verdict.
  assert.ok(verdict.reasons.every((r) => r.includes('would change:')));
});

test('cannotSolve: a covered task does not fire', () => {
  const verdict = cannotSolve({
    toolsAvailable: ['diagnostics'],
    memoryCovers: true,
    safeStrategyExists: true,
  });
  assert.equal(verdict.cannotSolve, false);
  assert.deepEqual(verdict.reasons, []);
});

/* ------------------------------------------------------------------ */
/* recordVerifiedOutcome — the learning-control gate                    */
/* ------------------------------------------------------------------ */

test('learning gate: a hash-verified outcome is stored as knowledge', async () => {
  resetMetacognitionLearning();
  const record = await storeEvidence({
    input: 'What is 2+2?',
    answer: 'Four.',
    modelId: null,
    route: 'demo',
    demoMode: true,
    intent: 'arithmetic-test',
  });
  const result = await recordVerifiedOutcome({
    taskType: 'arithmetic-test',
    prediction: { answer: 'Four.' },
    actual: { answer: 'Four.' },
    evidence: { kind: 'hash-match', verified: true, evidenceId: record.id },
  });
  assert.equal(result.storedAs, 'knowledge');
  assert.match(result.reason, /re-verified/);
  assert.equal(getVerifiedLearning().length, 1);
  assert.equal(getVerifiedLearning()[0].taskType, 'arithmetic-test');
  assert.equal(getRecordedAttempts().length, 0);
});

test('learning gate: an unverified outcome is stored as an attempt, never as knowledge', async () => {
  resetMetacognitionLearning();
  const result = await recordVerifiedOutcome({
    taskType: 'open-question',
    prediction: { answer: 'x' },
    actual: { answer: 'y' },
    evidence: { kind: 'tool-success', verified: false },
  });
  assert.equal(result.storedAs, 'attempt');
  assert.equal(getVerifiedLearning().length, 0);
  assert.equal(getRecordedAttempts().length, 1);
  assert.equal(getRecordedAttempts()[0].taskType, 'open-question');
});

test('learning gate: a claimed hash match that fails re-verification is an attempt', async () => {
  resetMetacognitionLearning();
  const record = await storeEvidence({
    input: 'What is 2+2?',
    answer: 'Four.',
    modelId: null,
    route: 'demo',
    demoMode: true,
    intent: 'arithmetic-test',
  });
  // Tamper with the stored record: the recomputed hash will no longer match.
  const all = (await memoryStore.get<any[]>('evidence')) ?? [];
  const tampered = all.map((r) =>
    r.id === record.id ? { ...r, answer: 'Five.' } : r,
  );
  await memoryStore.set('evidence', tampered);

  const result = await recordVerifiedOutcome({
    taskType: 'arithmetic-test',
    prediction: { answer: 'Four.' },
    actual: { answer: 'Four.' },
    evidence: { kind: 'hash-match', verified: true, evidenceId: record.id },
  });
  assert.equal(result.storedAs, 'attempt');
  assert.match(result.reason, /failed re-verification/);
  assert.equal(getVerifiedLearning().length, 0);
});

/* ------------------------------------------------------------------ */
/* Pipeline wiring — metacognition field, always present               */
/* ------------------------------------------------------------------ */

test('pipeline: every run carries metacognition with reasons', async () => {
  // Demo-mode precondition: the free gateway is ON by default in the
  // browser, which would answer via the live gateway instead of demo
  // mode. These tests assert demo mode, so they turn all cloud off.
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const result = await runPipeline('What is 2+2? Answer in one word.');
  assert.equal(result.demoMode, true, 'no model is loaded in the test process');
  const meta = result.metacognition;
  assert.ok(meta, 'metacognition field must always be present');
  assert.ok(meta.confidence.reasons.length > 0, 'confidence must carry reasons');
  assert.ok(
    meta.confidence.score >= 0 && meta.confidence.score <= 1,
    `confidence out of bounds: ${meta.confidence.score}`,
  );
  assert.ok(Array.isArray(meta.unknowns));
  assert.ok(['act', 'investigate', 'simulate', 'ask'].includes(meta.strategy.strategy));
  assert.ok(meta.strategy.rule.length > 0, 'strategy must record which rule fired');
  assert.equal(typeof meta.outcome.matched, 'boolean');
  assert.equal(typeof meta.outcome.verified, 'boolean');
});

test('pipeline: a demo-mode run matches its prediction and stores knowledge', async () => {
  const result = await runPipeline('Hello, are you there?');
  // Prediction: not blocked, answer produced, evidence stored.
  assert.equal(result.metacognition.outcome.matched, true);
  assert.equal(result.metacognition.outcome.verified, true);
  assert.equal(result.metacognition.outcome.storedAs, 'knowledge');
});

test('pipeline: a permission-blocked run is a detected mismatch, stored as an attempt', async () => {
  const result = await runPipeline('Post this to X', {
    requestedAction: { category: 'publishing', action: 'post to X', detail: 'test post' },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.metacognition.outcome.matched, false);
  assert.ok(
    result.metacognition.outcome.diff !== null &&
      result.metacognition.outcome.diff.includes('blocked'),
    `diff should name the block: ${result.metacognition.outcome.diff}`,
  );
  assert.equal(result.metacognition.outcome.verified, false);
  assert.equal(result.metacognition.outcome.storedAs, 'attempt');
  // Confidence must reflect the denial.
  assert.ok(
    result.metacognition.confidence.reasons.some((r) => r.includes('permission denied')),
    `confidence reasons should name the denial: ${result.metacognition.confidence.reasons}`,
  );
});
