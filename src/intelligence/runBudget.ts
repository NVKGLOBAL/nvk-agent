/**
 * NVK Agent — per-run budget + kill switch (MCNA slice 7).
 *
 * The only bound today is `maxNewTokens: 256`; that is not a budget. A
 * runaway planning/tool loop needs a real bound, enforced in code before
 * any loop or state-changing tool is enabled:
 *   - a per-run token budget (tokens the run may spend, counted as they
 *     are used — generation + tool calls);
 *   - a real iteration cap for any planning/tool loop;
 *   - a stop control (kill switch) the chat path can trigger mid-run.
 *
 * When a bound is hit the run stops with a named error (budget-exceeded /
 * iteration-cap / stopped) — never a silent continuation, never a faked
 * completion. Pure, dependency-light, tested in tests/run-budget.test.ts.
 */

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class IterationCapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IterationCapError';
  }
}

export class RunStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunStoppedError';
  }
}

export interface RunBudgetOptions {
  /** Max tokens the run may spend (generation + tool calls). Default 4096. */
  maxTokens?: number;
  /** Max iterations of a planning/tool loop. Default 10. */
  maxIterations?: number;
}

export class RunBudget {
  private readonly maxTokens: number;
  private readonly maxIterations: number;
  private tokensUsed = 0;
  private iterations = 0;
  private stopped = false;
  private stopReason: string | null = null;

  constructor(opts: RunBudgetOptions = {}) {
    this.maxTokens = opts.maxTokens ?? 4096;
    this.maxIterations = opts.maxIterations ?? 10;
  }

  public getTokensUsed(): number {
    return this.tokensUsed;
  }

  public getIterations(): number {
    return this.iterations;
  }

  public isStopped(): boolean {
    return this.stopped;
  }

  public getStopReason(): string | null {
    return this.stopReason;
  }

  // Record tokens spent. Throws BudgetExceededError when the run would
  // exceed its token budget — the caller stops the run, it does not
  // silently continue past the budget.
  public spendTokens(n: number): void {
    this.throwIfStopped();
    if (n < 0) throw new Error('spendTokens: token count must not be negative');
    if (this.tokensUsed + n > this.maxTokens) {
      throw new BudgetExceededError(
        `Token budget exceeded: ${this.tokensUsed + n} tokens would exceed the ${this.maxTokens}-token run budget.`,
      );
    }
    this.tokensUsed += n;
  }

  // Begin one iteration of a planning/tool loop. Throws IterationCapError
  // when the cap is hit — a runaway loop stops here, it does not spin.
  public beginIteration(): number {
    this.throwIfStopped();
    if (this.iterations >= this.maxIterations) {
      throw new IterationCapError(
        `Iteration cap reached: ${this.maxIterations} iterations. The loop stops here — a runaway loop is not allowed to spin.`,
      );
    }
    this.iterations += 1;
    return this.iterations;
  }

  // The kill switch. The chat path calls this when the user stops a run
  // mid-flight; every budget check then throws RunStoppedError.
  public requestStop(reason: string = 'Stopped by the user.'): void {
    this.stopped = true;
    this.stopReason = reason;
  }

  public throwIfStopped(): void {
    if (this.stopped) {
      throw new RunStoppedError(this.stopReason ?? 'Run stopped.');
    }
  }
}
