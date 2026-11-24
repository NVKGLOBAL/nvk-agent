/**
 * NVK Agent — DAG planning tests (MCNA slice 7).
 *
 * Run: npm test
 *
 * Replaces the canned 3-branch "planning". A plan is a DAG of tool calls
 * with predicted effects; execution is topological and fail-closed on
 * cycles/missing deps; predicted vs actual is compared per node; a failed
 * node triggers replanning (never a silent retry of the same failed step).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PlanDAG, PlanDAGError, topologicalOrder } from '../src/intelligence/planDAG';
import type { PlanNode } from '../src/intelligence/planDAG';
import { RunBudget } from '../src/intelligence/runBudget';

function node(id: string, tool: string, dependsOn: string[] = []): PlanNode {
  // The predicted effect is the expected success shape.
  return { id, tool, args: {}, predicted: { ok: true, tool }, dependsOn };
}

test('topological order: a dependent node runs after its dependency', () => {
  const ordered = topologicalOrder([
    node('b', 'report', ['a']),
    node('a', 'diagnostics'),
  ]);
  assert.deepEqual(ordered.map((n) => n.id), ['a', 'b']);
});

test('topological order: a cycle is rejected (fail-closed)', () => {
  assert.throws(
    () => topologicalOrder([node('a', 'x', ['b']), node('b', 'y', ['a'])]),
    PlanDAGError,
  );
});

test('topological order: a missing dependency is rejected (fail-closed)', () => {
  assert.throws(
    () => topologicalOrder([node('a', 'x', ['ghost'])]),
    PlanDAGError,
  );
});

test('run: a matching plan executes in order and records outcomes', async () => {
  const budget = new RunBudget({ maxIterations: 10 });
  const executed: string[] = [];
  const dag = new PlanDAG({
    budget,
    executeTool: async (n) => {
      executed.push(n.id);
      return { actual: { measured: 'diagnostics data' }, verified: true };
    },
    replan: () => null,
  });
  const results = await dag.run([
    node('a', 'diagnostics'),
    node('b', 'report', ['a']),
  ]);
  assert.deepEqual(executed, ['a', 'b']);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.outcome.matched));
  assert.ok(results.every((r) => r.outcome.verified));
});

test('run: a mismatched node triggers replanning (never a silent retry)', async () => {
  const budget = new RunBudget({ maxIterations: 10 });
  const executed: string[] = [];
  let replanCalled = 0;
  const dag = new PlanDAG({
    budget,
    executeTool: async (n) => {
      executed.push(n.id);
      // Node 'a' returns something different from its prediction.
      if (n.id === 'a') throw new Error('diagnostics failed');
      return { actual: { measured: 'diagnostics data' }, verified: true };
    },
    replan: (failedNode, outcome, remaining) => {
      replanCalled += 1;
      assert.equal(failedNode.id, 'a');
      assert.ok(outcome.diff);
      // The replan drops the failed node and offers an alternative.
      // Nodes that depended on the failed node are rewired to the
      // alternative (a replan must produce a VALID DAG — a node that
      // still depends on the dropped node is a missing dependency and
      // the plan is rejected, fail-closed).
      const rewired = remaining.map((n) => ({
        ...n,
        dependsOn: n.dependsOn.map((d) => (d === failedNode.id ? 'a-alt' : d)),
      }));
      return [node('a-alt', 'diagnostics-alt'), ...rewired];
    },
  });
  const results = await dag.run([
    node('a', 'diagnostics'),
    node('b', 'report', ['a']),
  ]);
  // 'a' ran once (failed), the replan ran 'a-alt' + 'b'. 'a' was NOT
  // retried — the alternative took its place.
  assert.deepEqual(executed, ['a', 'a-alt', 'b']);
  assert.equal(replanCalled, 1);
  assert.equal(results.find((r) => r.node.id === 'a')?.replanned, true);
});

test('run: a failed node that cannot be replanned stops the run', async () => {
  const budget = new RunBudget({ maxIterations: 10 });
  const dag = new PlanDAG({
    budget,
    // The tool throws (it does not just return a wrong value — the DAG
    // compares the outcome shape, so a wrong value is not a mismatch;
    // a thrown tool is).
    executeTool: async () => { throw new Error('diagnostics failed'); },
    replan: () => null,
  });
  await assert.rejects(
    () => dag.run([node('a', 'diagnostics')]),
    PlanDAGError,
  );
});

test('run: the iteration cap stops a runaway plan', async () => {
  const budget = new RunBudget({ maxIterations: 2 });
  const dag = new PlanDAG({
    budget,
    executeTool: async () => ({ actual: { measured: 'data' }, verified: true }),
    replan: () => null,
  });
  await assert.rejects(
    () => dag.run([
      node('a', 'x'),
      node('b', 'y'),
      node('c', 'z'),
    ]),
    /Iteration cap/,
  );
});

test('run: an empty plan returns no results', async () => {
  const budget = new RunBudget();
  const dag = new PlanDAG({
    budget,
    executeTool: async () => ({ actual: null, verified: true }),
    replan: () => null,
  });
  assert.deepEqual(await dag.run([]), []);
});
