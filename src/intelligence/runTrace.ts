/**
 * NVK Agent — persisted run traces (MCNA slice 7, telemetry).
 *
 * The in-memory 20-event ring buffer is replaced by durable records: a
 * run trace carries the token counts, latency, route, model, tool calls,
 * quota use, and outcome of one run, persisted so the "time saved"
 * metric (and any audit) has a ledger to read. Traces are stored in
 * localStorage when available (guarded — a denied store must not break
 * generation) and kept in memory otherwise; the list is capped (oldest
 * dropped first) so the store never grows unbounded.
 *
 * Pure, dependency-light, tested in tests/run-trace.test.ts.
 */

export interface RunTrace {
  id: string;
  startedAt: number;
  endedAt: number;
  /** Wall time in ms. */
  latencyMs: number;
  /** Route: 'local' | 'cloud:<provider>' | 'demo'. */
  route: string;
  /** Model id, or null when no model ran. */
  model: string | null;
  /** Tokens spent by the run (generation + tool calls), or null when unmeasured. */
  tokens: number | null;
  /** Tool calls made by the run (tool names, in order). */
  toolCalls: string[];
  /** Free-tier quota use for the run, when the cloud served it. */
  quota: { tier: string; tokens: number | null } | null;
  /** Outcome: 'ok' | 'error' | 'stopped' | 'budget-exceeded' | 'iteration-cap'. */
  outcome: string;
  /** Error message when the outcome is not ok. */
  error: string | null;
  /** The slice-6 judge verdict (pass/fail + score + reasons). Until the
   * judge exists, no score is presented as a quality signal. */
  judge?: { passed: boolean; score: number; reasons: string[] };
}

const LS_KEY = 'nvk-agent:run-traces';
const MAX_TRACES = 100;

function lsAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export class RunTraceStore {
  private traces: RunTrace[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (!lsAvailable()) return;
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RunTrace[];
      if (Array.isArray(parsed)) this.traces = parsed.slice(0, MAX_TRACES);
    } catch {
      this.traces = [];
    }
  }

  private save(): void {
    try {
      if (!lsAvailable()) return;
      localStorage.setItem(LS_KEY, JSON.stringify(this.traces.slice(0, MAX_TRACES)));
    } catch {
      // A denied store must not break generation.
    }
  }

  public record(trace: RunTrace): void {
    this.traces.unshift(trace);
    if (this.traces.length > MAX_TRACES) this.traces.length = MAX_TRACES;
    this.save();
  }

  public list(): RunTrace[] {
    return [...this.traces];
  }

  public get(id: string): RunTrace | undefined {
    return this.traces.find((t) => t.id === id);
  }

  public clear(): void {
    this.traces = [];
    this.save();
  }
}

export const runTraceStore = new RunTraceStore();
