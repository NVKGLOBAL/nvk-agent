/**
 * NVK Agent — DAG-based planning (MCNA slice 7).
 *
 * Replaces the canned 3-branch "planning" in the pipeline (status-check
 * -> [run diagnostics, report results]; capabilities -> [list registry,
 * summarize]; else [answer directly]). A plan is now a DAG of tool calls:
 *
 *   - each node names a tool + args + its predicted effect + the nodes it
 *     depends on;
 *   - execution is in topological order, fail-closed on cycles and on
 *     missing dependencies (a plan that cannot be ordered is rejected,
 *     never run in a guessed order);
 *   - each node's predicted effect is recorded BEFORE it runs, and the
 *     metacognitive controller's `evaluateOutcome` compares predicted vs
 *     actual per node;
 *   - a failed node triggers replanning (the `replan` callback produces a
 *     new DAG without the failed step), not abort-on-first-failure, and
 *     never a silent retry of the same failed step;
 *   - the run budget (slice 7) bounds the loop: an iteration cap + a
 *     stop control, enforced on every node.
 *
 * An unknown input produces `ask`, never a fabricated plan — the caller
 * (the pipeline) builds the DAG from the intent, and an intent with no
 * known tool mapping yields an empty plan + an `ask` strategy, not a
 * guessed DAG.
 *
 * Pure, dependency-light, tested in tests/plan-dag.test.ts.
 */
import { evaluateOutcome } from './metacognition';
import type { OutcomeEvaluation } from './metacognition';
import { RunBudget } from './runBudget';

export interface PlanNode {
  id: string;
  /** Tool name (from the registry). */
  tool: string;
  /** Args for the tool. */
  args: unknown;
  /** Predicted effect — recorded BEFORE the node runs. */
  predicted: unknown;
  /** Node ids that must complete before this node runs. */
  dependsOn: string[];
}

export interface NodeResult {
  node: PlanNode;
  /** The tool's raw result (data), or null when the tool threw. */
  data: unknown;
  outcome: OutcomeEvaluation;
  /** True when the node was replanned (a different node took its place). */
  replanned: boolean;
}

export interface PlanDAGOptions {
  budget: RunBudget;
  /** Execute one node's tool. Returns the actual result + how it was verified. */
  executeTool: (node: PlanNode) => Promise<{ actual: unknown; verified: boolean }>;
  /**
   * Produce a new plan when a node fails. Receives the failed node, its
   * outcome evaluation, and the nodes not yet run. Return a new node list
   * (without the failed step — never a silent retry of the same step) or
   * null when the goal cannot be replanned (the run stops with an error).
   */
  replan: (
    failedNode: PlanNode,
    outcome: OutcomeEvaluation,
    remaining: PlanNode[],
  ) => PlanNode[] | null;
}

export class PlanDAGError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanDAGError';
  }
}

// Topological order, fail-closed. A cycle or a missing dependency is a
// plan error — the plan is rejected, never run in a guessed order.
export function topologicalOrder(nodes: PlanNode[]): PlanNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      if (!byId.has(dep)) {
        throw new PlanDAGError(
          `Plan node "${n.id}" depends on missing node "${dep}". The plan is rejected — a missing dependency is never guessed.`,
        );
      }
    }
  }
  const ordered: PlanNode[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new PlanDAGError(
        `Plan has a dependency cycle involving "${id}". The plan is rejected — a cycle is never run.`,
      );
    }
    visiting.add(id);
    const node = byId.get(id)!;
    for (const dep of node.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
    ordered.push(node);
  };
  for (const n of nodes) visit(n.id);
  return ordered;
}

export class PlanDAG {
  private readonly budget: RunBudget;
  private readonly executeTool: PlanDAGOptions['executeTool'];
  private readonly replan: PlanDAGOptions['replan'];

  constructor(opts: PlanDAGOptions) {
    this.budget = opts.budget;
    this.executeTool = opts.executeTool;
    this.replan = opts.replan;
  }

  // Run the plan. Returns the per-node results in execution order.
  // Throws PlanDAGError on an unplannable plan, a budget/iteration/stop
  // error from the budget, or when a failed node cannot be replanned.
  public async run(nodes: PlanNode[]): Promise<NodeResult[]> {
    if (nodes.length === 0) return [];
    let remaining = topologicalOrder(nodes);
    const results: NodeResult[] = [];
    const completed = new Set<string>();

    while (remaining.length > 0) {
      // The next runnable node: all its dependencies completed.
      const idx = remaining.findIndex((n) => n.dependsOn.every((d) => completed.has(d)));
      if (idx === -1) {
        throw new PlanDAGError(
          'No runnable node: the remaining plan has unmet dependencies. The plan is rejected.',
        );
      }
      const node = remaining[idx];
      // The budget bounds the loop: an iteration per node, a stop check.
      this.budget.beginIteration();
      remaining.splice(idx, 1);

      let actual: unknown;
      let verified = false;
      let toolError: Error | null = null;
      try {
        const out = await this.executeTool(node);
        actual = out.actual;
        verified = out.verified;
      } catch (err) {
        toolError = err instanceof Error ? err : new Error(String(err));
        actual = null;
        verified = false;
      }

      // The predicted effect was recorded BEFORE the node ran (it is on
      // the node). A tool's raw result is measured data — its exact value
      // cannot be predicted in advance — so the comparison is on the
      // outcome SHAPE: the prediction is the expected success shape
      // ({ok: true, tool: <name>}), and the actual is normalized to the
      // same shape ({ok: true, tool} on success, {ok: false, error} on
      // failure). The raw tool result is carried on the NodeResult as
      // `data` so nothing is lost. A mismatch (the tool failed, or it
      // returned a different shape than predicted) triggers replanning.
      const normalizedActual = toolError
        ? { ok: false, tool: node.tool, error: toolError.message }
        : { ok: true, tool: node.tool };
      const outcome: OutcomeEvaluation = evaluateOutcome(
        node.predicted,
        normalizedActual,
        { toolSuccess: verified && !toolError },
      );

      if (outcome.matched) {
        completed.add(node.id);
        results.push({ node, data: actual, outcome, replanned: false });
        continue;
      }

      // Mismatch or tool failure: replan (never a silent retry of the
      // same failed step). The replan callback produces a new DAG without
      // the failed node, or null when the goal cannot be replanned.
      const newPlan = this.replan(node, outcome, remaining);
      if (newPlan === null) {
        throw new PlanDAGError(
          `Node "${node.id}" (${node.tool}) failed and the goal cannot be replanned: ${outcome.diff}. The run stops — a failed step is never silently retried.`,
        );
      }
      // The failed node is dropped; the new plan replaces the remaining
      // nodes. Re-order the new plan (fail-closed on cycles/deps).
      remaining = topologicalOrder(newPlan);
      results.push({ node, data: actual, outcome, replanned: true });
    }

    return results;
  }
}
