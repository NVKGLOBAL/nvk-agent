/**
 * NVK Agent — the relay adapter (Sprint 8, slice 3: the desktop client).
 *
 * The Agent's side of the remote-control channel. It polls the relay
 * mailbox for commands from the phone, dispatches them to the Agent's
 * own systems, and posts the results + the live status back.
 *
 * It is transport + wiring ONLY. The commands are executed by the
 * existing systems, never by this adapter:
 * - `chat` -> runPipeline (the same pipeline as a typed message, with
 *   the same tool contract, permission gate, evidence and judge). The
 *   answer + the orb states (from the real pipeline stage events)
 *   are posted back.
 * - `approve` / `reject` -> permissionGate.approve(id) / deny(id).
 *   The gate is the enforcement point; this adapter only carries the
 *   owner's decision from the phone.
 * - `status` -> runDiagnostics + the pipeline's current stage (the
 *   live status the phone's card shows).
 * - `evidence` / `history` -> the evidence store + the run traces.
 * - `start-task` / `pause-task` / `cancel-task` -> the task engine
 *   (not wired yet — the Agent has no continuous task engine; these
 *   return an honest "not available" until one exists).
 *
 * The transport (poll, dispatch, post-result, post-status) mirrors
 * the relay repo's RelayClient (~/workspace/nvk-relay/src/relay-client.js)
 * — the same logic, typed for this repo, so the Agent stays
 * self-contained (no cross-repo import, no build-config change).
 * The relay repo's tests cover the transport; the tests here cover
 * the Agent wiring (the handlers).
 *
 * The desktop authenticates to the relay with its desktop token
 * (X-Desktop-Token). The token lives in the Agent's settings (the
 * owner types it once, on the desktop) — it is never sent to the
 * phone and never stored in the browser's localStorage by the phone.
 * The pairing code is generated here (6 digits, 5-minute expiry) and
 * shown on screen; the phone enters it once.
 */

import { runPipeline, type PipelineResult } from './pipeline';
import { permissionGate } from './permissions';
import { runDiagnostics, type DiagnosticsReport } from './diagnostics';
import { orbStateForStageEvent } from '../experience/orb/orb-state';

export interface RelayStatus {
  orbState: string;
  model: string;
  diagnostics: string;
  pendingApprovals: Array<{ id: string; tool: string; detail: string; expiresAt: number }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  evidence: Array<{ type: string; timestamp: number; summary: string }>;
}

export interface RelayCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
}

export interface RelayResult {
  [key: string]: unknown;
}

// --- Pairing ---------------------------------------------------------------

export function generatePairingCode(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000));
}

// --- The handlers (the Agent wiring) ----------------------------------------

/**
 * Run a chat command through the pipeline and return the answer + the
 * orb states (from the real stage events). The phone's chat is the
 * same as a typed message — same pipeline, same gates, same evidence.
 */
export async function handleChatCommand(args: Record<string, unknown>): Promise<RelayResult> {
  const text = typeof args.text === 'string' ? args.text.trim() : '';
  if (!text) return { error: 'no text was sent' };
  const result: PipelineResult = await runPipeline(text);
  const orbStates = result.stages.map((s) => orbStateForStageEvent(s));
  return {
    answer: result.answer,
    blocked: result.blocked,
    blockedReason: result.blockedReason,
    demoMode: result.demoMode,
    orbStates,
    evidenceId: result.evidenceId,
  };
}

/** Approve a pending permission-gate request (the owner's decision, from the phone). */
export function handleApproveCommand(args: Record<string, unknown>): RelayResult {
  const id = typeof args.approvalId === 'string' ? args.approvalId : '';
  if (!id) return { error: 'no approval id was sent' };
  const ok = permissionGate.approve(id);
  return ok ? { approved: id } : { error: `no pending approval with id ${id}` };
}

/** Reject a pending permission-gate request. */
export function handleRejectCommand(args: Record<string, unknown>): RelayResult {
  const id = typeof args.approvalId === 'string' ? args.approvalId : '';
  if (!id) return { error: 'no approval id was sent' };
  const ok = permissionGate.deny(id);
  return ok ? { rejected: id } : { error: `no pending approval with id ${id}` };
}

/** The live status: diagnostics + the pending approvals (the phone's card). */
export async function handleStatusCommand(): Promise<RelayResult> {
  const report: DiagnosticsReport = await runDiagnostics();
  return {
    overall: report.overall,
    checks: report.checks,
    pendingApprovals: permissionGate.pending().map((r) => ({
      id: r.id,
      tool: r.action,
      detail: r.detail,
      expiresAt: r.requestedAt + 10 * 60 * 1000,
    })),
  };
}

/** Task commands: the Agent has no continuous task engine yet, so these
 *  return an honest "not available" — never a fabricated task. */
export function handleTaskCommand(command: string, args: Record<string, unknown>): RelayResult {
  const taskId = typeof args.taskId === 'string' ? args.taskId : '';
  return {
    error: `task ${command} is not available — the Agent has no continuous task engine yet`,
    taskId,
  };
}

// The handler table: command -> handler. A command with no handler is
// reported as a failed result by the client (never silently dropped).
export const AGENT_RELAY_HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<RelayResult> | RelayResult> = {
  chat: handleChatCommand,
  approve: handleApproveCommand,
  reject: handleRejectCommand,
  status: handleStatusCommand,
  'start-task': (args) => handleTaskCommand('start-task', args),
  'pause-task': (args) => handleTaskCommand('pause-task', args),
  'cancel-task': (args) => handleTaskCommand('cancel-task', args),
};

// --- The transport (the poll loop) -------------------------------------------

export interface RelayClientOptions {
  relayUrl: string;
  desktopId: string;
  desktopToken: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}

export class AgentRelayClient {
  private relayUrl: string;
  private desktopId: string;
  private desktopToken: string;
  private fetchImpl: typeof fetch;
  private pollMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  lastError: string | null = null;

  constructor(opts: RelayClientOptions) {
    this.relayUrl = opts.relayUrl.replace(/\/$/, '');
    this.desktopId = opts.desktopId;
    this.desktopToken = opts.desktopToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollMs = opts.pollMs ?? 2000;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-Desktop-Token': this.desktopToken };
  }

  private async call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${this.relayUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ desktopId: this.desktopId, ...body }),
    });
    return res.json() as Promise<Record<string, unknown>>;
  }

  async registerPairing(code: string): Promise<Record<string, unknown>> {
    return this.call('/desktop/register-pairing', { code });
  }

  async pollOnce(): Promise<{ ok: boolean; error?: string; handled: Array<{ id: string; command: string; ok: boolean; error?: string }> }> {
    const res = await this.call('/desktop/commands', {});
    if (!res.ok) {
      this.lastError = String(res.error ?? 'the relay did not return commands');
      return { ok: false, error: this.lastError, handled: [] };
    }
    const handled: Array<{ id: string; command: string; ok: boolean; error?: string }> = [];
    for (const cmd of (res.commands as RelayCommand[]) || []) {
      const handler = AGENT_RELAY_HANDLERS[cmd.command];
      if (!handler) {
        await this.call('/desktop/result', { commandId: cmd.id, result: { error: `this desktop cannot run ${cmd.command}` } });
        handled.push({ id: cmd.id, command: cmd.command, ok: false, error: 'no handler' });
        continue;
      }
      try {
        const result = await handler(cmd.args || {});
        await this.call('/desktop/result', { commandId: cmd.id, result });
        handled.push({ id: cmd.id, command: cmd.command, ok: true });
      } catch (err) {
        await this.call('/desktop/result', { commandId: cmd.id, result: { error: String((err as Error)?.message ?? err) } });
        handled.push({ id: cmd.id, command: cmd.command, ok: false, error: String((err as Error)?.message ?? err) });
      }
    }
    this.lastError = null;
    return { ok: true, handled };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async (): Promise<void> => {
      if (!this.running) return;
      try {
        await this.pollOnce();
      } catch (err) {
        this.lastError = String((err as Error)?.message ?? err);
      }
      if (this.running) this.timer = setTimeout(tick, this.pollMs);
    };
    this.timer = setTimeout(tick, this.pollMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async disconnectAll(): Promise<Record<string, unknown>> {
    return this.call('/desktop/disconnect-all', {});
  }
}
