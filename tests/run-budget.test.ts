/**
 * NVK Agent — per-run budget + kill switch tests (MCNA slice 7).
 *
 * Run: npm test
 *
 * The only bound today is `maxNewTokens: 256`; that is not a budget. A
 * runaway planning/tool loop needs a real bound, enforced in code before
 * any loop or state-changing tool is enabled. These tests pin the three
 * bounds: the token budget, the iteration cap, and the stop control.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RunBudget,
  BudgetExceededError,
  IterationCapError,
  RunStoppedError,
} from '../src/intelligence/runBudget';

test('token budget: spending within the budget is allowed', () => {
  const b = new RunBudget({ maxTokens: 100 });
  b.spendTokens(40);
  b.spendTokens(60);
  assert.equal(b.getTokensUsed(), 100);
});

test('token budget: exceeding the budget throws BudgetExceededError', () => {
  const b = new RunBudget({ maxTokens: 100 });
  b.spendTokens(90);
  assert.throws(() => b.spendTokens(11), BudgetExceededError);
  // The run stops — the tokens are not spent past the budget.
  assert.equal(b.getTokensUsed(), 90);
});

test('iteration cap: a runaway loop stops at the cap', () => {
  const b = new RunBudget({ maxIterations: 3 });
  b.beginIteration();
  b.beginIteration();
  b.beginIteration();
  assert.equal(b.getIterations(), 3);
  assert.throws(() => b.beginIteration(), IterationCapError);
});

test('runaway loop: a while(true) loop is stopped by the iteration cap', () => {
  const b = new RunBudget({ maxIterations: 5 });
  let ran = 0;
  assert.throws(() => {
    while (true) {
      b.beginIteration();
      ran += 1;
    }
  }, IterationCapError);
  assert.equal(ran, 5);
});

test('kill switch: requestStop makes every check throw RunStoppedError', () => {
  const b = new RunBudget({ maxTokens: 1000, maxIterations: 10 });
  b.spendTokens(10);
  b.requestStop('Stopped by the user.');
  assert.equal(b.isStopped(), true);
  assert.equal(b.getStopReason(), 'Stopped by the user.');
  assert.throws(() => b.throwIfStopped(), RunStoppedError);
  assert.throws(() => b.spendTokens(1), RunStoppedError);
  assert.throws(() => b.beginIteration(), RunStoppedError);
});
