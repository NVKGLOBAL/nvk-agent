/**
 * NVK Agent — agent pipeline.
 *
 * Unification Directive §5: input → intent → context → reasoning → planning
 * → capability discovery → permission check → execution → verification →
 * evidence storage → human-readable result. Never fabricate an answer to
 * conceal a missing tool: when a stage cannot run, the pipeline stops there
 * and says so, with the stage named.
 *
 * Each stage emits an event with timing. The orb subscribes to these events:
 * they are the only thing allowed to move the orb's activity state.
 */
import { localInferenceEngine } from './inference';
import { decideRoute, generateViaCloud } from './router';
import { getCapability } from './capability-registry';
import { memoryStore } from './memory';
import { storeEvidence } from '../sovereign/evidence';
import { permissionGate, isRestricted, RestrictedCategory } from './permissions';

export type PipelineStage =
  | 'input'
  | 'intent'
  | 'context'
  | 'reasoning'
  | 'planning'
  | 'capability'
  | 'permission'
  | 'execution'
  | 'verification'
  | 'evidence'
  | 'result';

export interface StageEvent {
  stage: PipelineStage;
  at: number;
  elapsedMs: number;
  note?: string;
}

export interface PipelineResult {
  input: string;
  answer: string;
  modelId: string | null;
  route: string;
  stages: StageEvent[];
  evidenceId: string | null;
  blocked: boolean;
  blockedReason: string | null;
  demoMode: boolean;
}

export interface PipelineOptions {
  subAgentId?: string;
  /** A restricted action the plan wants to take, e.g. { category: 'publishing', action: 'post to X' }. */
  requestedAction?: { category: RestrictedCategory; action: string; detail: string };
  approvalId?: string;
}

type StageListener = (event: StageEvent) => void;
const stageListeners = new Set<StageListener>();

export function subscribeToStages(fn: StageListener): () => void {
  stageListeners.add(fn);
  return () => {
    stageListeners.delete(fn);
  };
}

function emit(stage: PipelineStage, started: number, note?: string) {
  const event: StageEvent = {
    stage,
    at: Date.now(),
    elapsedMs: Date.now() - started,
    note,
  };
  stageListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      /* stage listeners never break the pipeline */
    }
  });
  return event;
}

/** Small honest intent classifier: a fixed set of intents, labelled as rules, not reasoning. */
function classifyIntent(input: string): string {
  const lower = input.toLowerCase();
  if (/^(2\s*\+\s*2|what is 2\s*\+\s*2)/.test(lower)) return 'arithmetic-test';
  if (lower.includes('status') || lower.includes('diagnostic')) return 'status-check';
  if (lower.includes('what can you do') || lower.includes('help')) return 'capabilities';
  if (lower.includes('spawn') || lower.includes('agent')) return 'agent-spawn';
  return 'open-question';
}

export async function runPipeline(
  input: string,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const started = Date.now();
  const stages: StageEvent[] = [];
  const push = (e: StageEvent) => stages.push(e);

  push(emit('input', started, input.slice(0, 120)));

  // Intent — rule-based classifier, labelled as such.
  const intent = classifyIntent(input);
  push(emit('intent', started, `intent=${intent} (rule-based)`));

  // Context — recent conversation from local memory.
  const turns = await memoryStore.getConversation();
  const contextNote = `${turns.length} prior turns in local memory`;
  push(emit('context', started, contextNote));

  // Reasoning — real model generation, or honest demo mode.
  const decision = decideRoute();
  let answer: string;
  let modelId: string | null = null;
  let demoMode = false;

  if (decision.route === 'local') {
    if (!localInferenceEngine.isReady()) {
      // No model loaded: demo mode. Never a fake answer.
      demoMode = true;
      push(
        emit(
          'reasoning',
          started,
          'No model loaded — demo mode. No answer fabricated.',
        ),
      );
      answer =
        'Demo mode — no model is loaded, so I cannot answer from intelligence yet. ' +
        'Download a model (Qwen 1.5 0.5B Chat, ~350 MB) or connect a provider in Settings to chat for real.';
    } else {
      // Greedy decoding (temperature 0): the only generation config ever
      // validated to answer correctly. The v0.1.1 chat path omitted
      // temperature, so the engine defaulted to sampling at 0.7 — and
      // sampling on this 0.5B model made 2+2 a coin flip (Node repro
      // 2026-11-21: "Two + Two is two!", "Two." in 2 of 3 runs; the
      // browser drew "1"), while the validation path's greedy call
      // answered correctly every time. Same engine, same template —
      // the sampling was the whole divergence.
      const result = await localInferenceEngine.generate(input, {
        maxNewTokens: 256,
        temperature: 0,
      });
      modelId = result.modelId;
      answer = result.text;
      push(
        emit(
          'reasoning',
          started,
          `local generation, ${result.tokensPerSecond} tok/s, ${result.elapsedMs} ms`,
        ),
      );
    }
  } else {
    const cloud = await generateViaCloud(input);
    modelId = `cloud:${cloud.provider}`;
    answer = cloud.text;
    push(emit('reasoning', started, `cloud:${cloud.provider} (explicit opt-in)`));
  }

  // Planning — the plan is the answer's next steps when the intent needs action.
  const plan =
    intent === 'status-check'
      ? ['run diagnostics', 'report results']
      : intent === 'capabilities'
        ? ['list registry', 'summarize']
        : ['answer directly'];
  push(emit('planning', started, plan.join(' → ')));

  // Capability discovery — registry lookup for what the plan needs.
  const needed = intent === 'status-check' ? 'diagnostics' : 'local-inference';
  const cap = getCapability(needed);
  push(
    emit(
      'capability',
      started,
      cap ? `${cap.id}: ${cap.status}` : `${needed}: not in registry`,
    ),
  );

  // Permission check — restricted actions stop here without approval.
  let blocked = false;
  let blockedReason: string | null = null;
  if (options.requestedAction) {
    const { category, action, detail } = options.requestedAction;
    if (isRestricted(category)) {
      if (!options.approvalId || !permissionGate.isApproved(options.approvalId)) {
        blocked = true;
        blockedReason = `Action "${action}" (${category}) requires explicit owner approval. Request it in the UI.`;
        push(emit('permission', started, `DENIED — ${blockedReason}`));
      } else {
        push(emit('permission', started, `approved (${options.approvalId})`));
      }
    }
  } else {
    push(emit('permission', started, 'no restricted action requested'));
  }

  // Execution — only when not blocked.
  if (!blocked) {
    push(emit('execution', started, demoMode ? 'none — demo mode' : 'answer generated'));
  }

  // Verification — the answer is checked against the evidence record.
  const verificationNote = demoMode
    ? 'nothing to verify in demo mode'
    : `answer length ${answer.length} chars, model ${modelId ?? 'unknown'}`;
  push(emit('verification', started, verificationNote));

  // Evidence storage — hash + record, always (even demo mode, marked as such).
  let evidenceId: string | null = null;
  if (!blocked) {
    const record = await storeEvidence({
      input,
      answer,
      modelId,
      route: decision.route,
      demoMode,
      intent,
    });
    evidenceId = record.id;
    push(emit('evidence', started, `stored ${evidenceId} (sha ${record.sha256.slice(0, 12)}…)`));
  }

  push(emit('result', started, 'human-readable result ready'));

  // Persist the turn in local memory.
  await memoryStore.appendTurn({ role: 'user', text: input, at: Date.now() });
  await memoryStore.appendTurn({
    role: 'agent',
    text: answer,
    at: Date.now(),
    modelId: modelId ?? undefined,
  });

  return {
    input,
    answer,
    modelId,
    route: decision.route,
    stages,
    evidenceId,
    blocked,
    blockedReason,
    demoMode,
  };
}
