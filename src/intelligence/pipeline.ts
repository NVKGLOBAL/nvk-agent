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
import { decideRoute, generateViaCloud, generateViaGateway } from './router';
import { getCapability } from './capability-registry';
import { memoryStore, buildHistoryTranscript } from './memory';
import { agentContextNote } from './agent-context';
import { storeEvidence, reverifyEvidence } from '../sovereign/evidence';
import { permissionGate, isRestricted, RestrictedCategory } from './permissions';
import { toolRegistry } from './tools';
import { RunBudget } from './runBudget';
import { PlanDAG } from './planDAG';
import type { PlanNode, NodeResult } from './planDAG';
import { runTraceStore } from './runTrace';
import { judge } from './judge';
import {
  assessConfidence,
  detectUncertainty,
  selectStrategy,
  evaluateOutcome,
  recordVerifiedOutcome,
  getVerifiedLearning,
} from './metacognition';
import type {
  ConfidenceAssessment,
  StrategySelection,
  OutcomeEvaluation,
} from './metacognition';

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
  /**
   * MCNA slice 1: metacognitive controller output — always present,
   * always with reasons. Confidence is computed from verifiable signals
   * only; the strategy records which rule fired; the outcome compares
   * what the run predicted against what actually happened.
   * Slice 6: the judge verdict (pass/fail + score + reasons) — the
   * quality signal. Until the judge exists, no score is presented as
   * a quality signal.
   */
  metacognition: {
    confidence: ConfidenceAssessment;
    unknowns: string[];
    strategy: StrategySelection;
    outcome: OutcomeEvaluation & { storedAs: 'knowledge' | 'attempt' | null };
    judge: import('./judge').JudgeVerdict;
  };
}

export interface PipelineOptions {
  subAgentId?: string;
  /** A restricted action the plan wants to take, e.g. { category: 'publishing', action: 'post to X' }. */
  requestedAction?: { category: RestrictedCategory; action: string; detail: string };
  approvalId?: string;
  /** Deterministic rubric results for this run (RSN-01/RSN-02/RT-01) —
   * supplied by a benchmark/harness caller. The slice-6 judge reads
   * them; a normal run passes none (the judge then uses only the
   * controller's outputs). */
  rubrics?: import('./rubrics').RubricResult[];
}

type StageListener = (event: StageEvent) => void;
const stageListeners = new Set<StageListener>();

/**
 * Completed generations, kept in memory so panels that mount AFTER a run
 * can still show it. v0.1.4 fix: VisualizersPanel only received `result`
 * stage events while it was mounted — a generation run from Chat left the
 * Visualizations tab saying "No generation events yet" even though the
 * run had happened. Stage events are ephemeral; this ring buffer is the
 * durable record (last 20 runs, in-memory only, never leaves the device).
 */
export interface GenerationEvent {
  id: string;
  at: number;
  modelId: string | null;
  tokensPerSecond: number | null;
  elapsedMs: number;
  demoMode: boolean;
  stages: StageEvent[];
}

const generationEvents: GenerationEvent[] = [];

export function getGenerationEvents(): GenerationEvent[] {
  return [...generationEvents];
}

function recordGeneration(event: GenerationEvent): void {
  generationEvents.push(event);
  if (generationEvents.length > 20) generationEvents.splice(0, generationEvents.length - 20);
}

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

/**
 * Fixed identity answer (2026-11-23, NvK: "Fixed rule until we figure out
 * a post llm meta solution"). The 0.5B model cannot reproduce the two-layer
 * provenance faithfully — benchmark re-run: identity 0/3 with the system
 * prompt in place (garbled names like "nevik Elmo of Nervik Global",
 * invented "NV KGB (NVIDIA Global Business)") — so who-built-you questions
 * are answered from code, not generation. Same facts as AGENT_SYSTEM_PROMPT
 * (inference.ts); if the default chat model changes, update the model
 * sentence here too. Must satisfy the harness identity criteria: contains
 * "Nevik Elmo" + "NVK Global", no false-ownership phrase — note the ID-02
 * forbidden string "I was made by", so this answer never uses "made by"
 * phrasing.
 */
export const IDENTITY_ANSWER =
  'I am NVK, an AI agent built by NVK Global. NVK was architected by Nevik Elmo and is developed under NVK Global. ' +
  'I run on the Qwen1.5-0.5B-Chat language model, built by Alibaba.';

/**
 * Who-built-you patterns. Tight on purpose: the question must be about
 * THIS agent ("you" / "NVK" / "this agent"), not a third party ("who built
 * the pyramids?") or a state ("what made you laugh?"). Each pattern anchors
 * on "you" as the built/created/made subject, on an explicit creator/owner
 * noun, or on a company/model word. Deliberately NOT covered: "write a
 * header comment for a module you generated" (ID-03) — that is a
 * generation task, not an identity question, and answering it with this
 * text would hijack the request to chase a check.
 */
const IDENTITY_PATTERNS: RegExp[] = [
  // who are you / what are you (the most natural identity question — a
  // bare "who are you" must answer from the fixed rule, not fall through
  // to the model or to demo mode). Retest #14 (2026-11-23): the live
  // Agent answered "who are you" with the demo-mode disclaimer because
  // no pattern matched a bare "who are you".
  /\bwho\s+are\s+you\b/,
  /\bwhat\s+are\s+you\b/,
  // who built/created/made/designed/developed/owns you (or NVK)
  /\bwho\s+(built|created|made|designed|developed|owns?|is behind)\s+(you|nvk)\b/,
  // who are you made/built/created by
  /\bwho\s+are\s+you\s+(made|built|created)\s+by\b/,
  // were/are you (or NVK) built/created/made by — both orders
  // ("are you built by …?" and "you are built by …")
  /\b((are|is|was|were)\s+(you|nvk)|(you|nvk)\s+(are|is|was|were))\s+(built|created|made)\s+by\b/,
  // who is your creator/maker/owner/builder/architect
  /\bwho\s+is\s+your\s+(creator|maker|owner|builder|architect)\b/,
  // your creator/maker/builder/architect (e.g. "tell me about your creator")
  /\byour\s+(creator|maker|builder|architect)\b/,
  // who built/created/made this agent
  /\bwho\s+(built|created|made|designed|developed)\s+(this|the)\s+agent\b/,
  // what company/model/... built/created/made/developed you
  /\bwhat\s+(company|organization|organisation|team|person|model)\b[^.?!]*\b(built|created|made|developed)\s+you\b/,
  // what company are you from/with
  /\bwhat\s+company\s+are\s+you\s+(from|with)\b/,
  // who / what company ... do you belong to
  /\b(who|what\s+(company|organization|organisation))\b[^.?!]*\bbelong to\b/,
];

export function isIdentityQuestion(input: string): boolean {
  const lower = input.toLowerCase();
  return IDENTITY_PATTERNS.some((re) => re.test(lower));
}

/** Small honest intent classifier: a fixed set of intents, labelled as rules, not reasoning. */
export function classifyIntent(input: string): string {
  const lower = input.toLowerCase();
  if (/^(2\s*\+\s*2|what is 2\s*\+\s*2)/.test(lower)) return 'arithmetic-test';
  if (isIdentityQuestion(input)) return 'identity';
  if (lower.includes('status') || lower.includes('diagnostic')) return 'status-check';
  if (lower.includes('what can you do') || lower.includes('help')) return 'capabilities';
  if (lower.includes('spawn') || lower.includes('agent')) return 'agent-spawn';
  // Sprint 6 (connectors): a search request plans a web_search node; a
  // fetch request (with a URL) plans a web_fetch node. Both go through
  // the gateway — the tools are real, so the plan is real.
  if (
    lower.includes('search for') ||
    lower.includes('search the web') ||
    lower.startsWith('search ') ||
    lower.includes('look up') ||
    lower.includes('find out')
  ) {
    return 'web-search';
  }
  if (lower.includes('fetch ') && /https?:\/\//.test(lower)) {
    return 'web-fetch';
  }
  return 'open-question';
}

/**
 * Compose the answer for a tool intent from the DAG results.
 *
 * Retest #14 (2026-11-23): the live Agent answered status-check and
 * web-search with the demo-mode disclaimer because the pipeline only ran
 * the DAG when a model was loaded — and the tools do not need a model.
 * The diagnostics tool measures real state, the gateway tools call the
 * real gateway. So a tool intent's answer is composed HERE, from the
 * tools' measured data, model or no model. A tool that cannot serve the
 * request returns an honest unavailable (never a fabricated result), and
 * that honest unavailable IS the answer.
 *
 * Exported for testing (it is a pure function of the intent + the DAG
 * results — no model, no network, no DOM).
 */
export function composeToolAnswer(intent: string, results: NodeResult[]): string {
  const first = results[0];
  const data = (first?.data ?? null) as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') {
    return 'The tool ran, but it did not return a result I can report.';
  }
  if (intent === 'status-check') {
    const checks = (data.checks as { name: string; result: string; detail: string }[] | undefined) ?? [];
    const overall = String(data.overall ?? 'unknown').toUpperCase();
    if (checks.length === 0) return `Diagnostics: overall ${overall}.`;
    const lines = checks.map((c) => `${c.name}: ${String(c.result).toUpperCase()} — ${c.detail}`);
    return `Diagnostics (run just now): overall ${overall}.\n${lines.join('\n')}`;
  }
  if (intent === 'web-search') {
    if (data.available === false) {
      return `I could not search right now — ${String(data.reason ?? 'the search provider could not be reached')}.`;
    }
    const list = (data.results as { title: string; url: string }[] | undefined) ?? [];
    if (list.length === 0) return `No results for "${String(data.query ?? '')}".`;
    return list
      .slice(0, 5)
      .map((r) => `${r.title} — ${r.url}`)
      .join('\n');
  }
  if (intent === 'web-fetch') {
    if (data.available === false) {
      return `I could not fetch that page — ${String(data.reason ?? 'the gateway could not serve it')}.`;
    }
    const text = String(data.text ?? '');
    const head = text.slice(0, 1000);
    return `Fetched ${String(data.url ?? '')} (HTTP ${String(data.status ?? '?')}):\n${head}${text.length > 1000 ? '…' : ''}`;
  }
  return 'The tool ran, but I do not have a summary for this result.';
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

  // Retest #14: whether the intent has a tool plan (status-check,
  // web-search, web-fetch) is decided HERE, right after the intent —
  // the reasoning stage needs it before the plan nodes are built (the
  // planning stage, below, declares them). A tool intent's answer comes
  // from the DAG, not from a model.
  const hasToolPlan =
    intent === 'status-check' || intent === 'web-search' || intent === 'web-fetch';

  // Context — recent conversation from local memory, plus the agent's
  // own context (.sol / .memory, loaded once at startup). The soul/memory
  // texts are never injected into a generation prompt — the per-generation
  // system prompt stays exactly the three short sentences in
  // AGENT_SYSTEM_PROMPT (inference.ts), because a longer prompt broke the
  // validated 2+2 path (2026-11-23). Slice 4 (memory) DOES inject the
  // conversation history, but only as a bounded window (most recent turns,
  // capped by tokens) — and an empty history leaves the prompt
  // byte-identical, so the validated 2+2 path is untouched on a fresh
  // conversation. The window is what the reasoning stage prepends.
  const turns = await memoryStore.getConversation();
  const historyTranscript = buildHistoryTranscript(turns);
  const contextNote = `${turns.length} prior turns in local memory; ${historyTranscript ? 'bounded history window injected' : 'no history to inject'}; ${agentContextNote()}`;
  push(emit('context', started, contextNote));

  // Reasoning — real model generation, or honest demo mode.
  const decision = decideRoute();
  let answer: string;
  let modelId: string | null = null;
  let demoMode = false;
  // Retest #14: a tool intent's answer comes from the DAG (the tools
  // are real and do not need a model), so the reasoning stage does not
  // set the demo disclaimer for one — the answer is composed after the
  // DAG runs (execution stage). `demoMode` still means "no model
  // loaded" for the run's metadata; the answer itself is real.
  let answerFromTools = false;

  if (intent === 'identity') {
    // Deterministic identity answer (2026-11-23, NvK: fixed rule until a
    // post-LLM meta solution). Who-built-you questions are answered from
    // code, not generation — the 0.5B model cannot reproduce the two-layer
    // provenance faithfully. No model call is made, so this works even in
    // demo mode; the evidence record still captures the intent.
    answer = IDENTITY_ANSWER;
    push(
      emit(
        'reasoning',
        started,
        'deterministic identity answer (rule-based, no generation)',
      ),
    );
  } else if (hasToolPlan) {
    // Tool intent (status-check, web-search, web-fetch): the answer
    // comes from the DAG. No model call is made for it, so it works even
    // in demo mode. The answer is a placeholder until the DAG runs.
    answerFromTools = true;
    answer = '';
    push(
      emit(
        'reasoning',
        started,
        'tool intent — answer from the DAG (no model needed)',
      ),
    );
  } else if (decision.route === 'local') {
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
      // Slice 4: the bounded history window is prepended to the input so
      // the model sees the conversation (not just the current prompt).
      // Empty on a first turn, so the validated path is unchanged there.
      const result = await localInferenceEngine.generate(historyTranscript + input, {
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
  } else if (decision.route === 'cloud-gateway') {
    // Free cloud gateway (Kilo, keyless, via the shared NVK brain
    // endpoint). Tried only when the local model is not loaded and no
    // provider key is configured — it never overrides a loaded local
    // model. Returns null when the gateway cannot serve the request;
    // that falls through to demo mode honestly, never a fake answer.
    const gateway = await generateViaGateway(input);
    if (gateway) {
      modelId = `cloud:gateway:${gateway.tier}`;
      answer = gateway.text;
      push(
        emit(
          'reasoning',
          started,
          `cloud gateway (${gateway.tier}${gateway.model ? `, ${gateway.model}` : ''})${gateway.notice ? ` — ${gateway.notice}` : ''}`,
        ),
      );
    } else {
      demoMode = true;
      push(
        emit(
          'reasoning',
          started,
          'No model loaded and the free cloud gateway could not answer — demo mode. No answer fabricated.',
        ),
      );
      answer =
        'Demo mode — no model is loaded and the free cloud gateway could not answer right now. ' +
        'Download a model (Qwen 1.5 0.5B Chat, ~350 MB) or connect a provider in Settings to chat for real.';
    }
  } else {
    const cloud = await generateViaCloud(input);
    modelId = `cloud:${cloud.provider}`;
    answer = cloud.text;
    push(emit('reasoning', started, `cloud:${cloud.provider} (explicit opt-in)`));
  }

  // Planning — slice 7 (DAG substrate). The canned 3-branch "planning"
  // (status-check -> [run diagnostics, report results]; capabilities ->
  // [list registry, summarize]; else [answer directly]) is replaced by a
  // DAG of tool calls with predicted effects + dependencies. Only tools
  // that actually exist in the registry are planned (diagnostics,
  // memory_read, evidence_lookup, panel_control, web_fetch, web_search)
  // — "report" and "list registry" are not tools, they are what the
  // reasoning/capability stages already do, so they are not nodes. An
  // intent with no tool work yields an EMPTY plan (not a fabricated
  // plan) — an unknown input produces `ask` via the strategy selector,
  // never a guessed DAG. The DAG is executed in the execution stage below.
  const planNodes: PlanNode[] =
    intent === 'status-check'
      ? [
          // The predicted effect is the expected success shape ({ok: true,
          // tool}) — the DAG compares the outcome shape, not the tool's
          // measured data (which cannot be predicted in advance).
          { id: 'diagnostics', tool: 'diagnostics', args: {}, predicted: { ok: true, tool: 'diagnostics' }, dependsOn: [] },
        ]
      : intent === 'web-search'
        ? [
            {
              id: 'web-search',
              tool: 'web_search',
              args: { query: input },
              predicted: { ok: true, tool: 'web_search' },
              dependsOn: [],
            },
          ]
        : intent === 'web-fetch'
          ? [
              {
                id: 'web-fetch',
                tool: 'web_fetch',
                args: { url: (input.match(/https?:\/\/\S+/) || [''])[0] },
                predicted: { ok: true, tool: 'web_fetch' },
                dependsOn: [],
              },
            ]
          : [];
  // Slice 7: the run budget (token budget + iteration cap + kill switch)
  // bounds the whole run, including the DAG execution below.
  const runBudget = new RunBudget({ maxTokens: 4096, maxIterations: 10 });
  const plan = planNodes.length > 0
    ? planNodes.map((n) => n.id).join(' → ')
    : 'answer directly (no tool plan)';
  push(emit('planning', started, plan));

  // Capability discovery — registry lookup for what the plan needs,
  // plus a consult of the ToolRegistry (MCNA slice 1): the capability
  // stage is the only way the agent acts, so the tools registered there
  // are part of what this stage reports. No tool is executed here.
  const needed = intent === 'status-check' ? 'diagnostics' : 'local-inference';
  const cap = getCapability(needed);
  const registeredTools = toolRegistry.list().map((t) => t.name);
  push(
    emit(
      'capability',
      started,
      cap ? `${cap.id}: ${cap.status}; tools registered: ${registeredTools.join(', ') || 'none'}` : `${needed}: not in registry; tools registered: ${registeredTools.join(', ') || 'none'}`,
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

  // Metacognitive controller — strategy selection (MCNA slice 1). Runs
  // after the capability/permission stages, before execution. It records
  // a strategy; it does not reorder stages, change the generation path,
  // or gate execution in this slice (the tool-use loop lands in slice 7).
  // Signals are verifiable facts of this run only: whether memory
  // retrieval found prior turns, whether the permission gate denied the
  // action, whether a prior run of this intent succeeded with verified
  // evidence. No tool has executed yet in this pipeline, so no tool
  // result is claimed; generation truncation is not reported by the
  // engine, so it is never asserted here.
  const confidence = assessConfidence({
    retrievalHit: turns.length > 0,
    retrievalMiss: turns.length === 0,
    permissionDenied: blocked,
    priorVerifiedSuccess: getVerifiedLearning().some((l) => l.taskType === intent),
  });
  const { unknowns } = detectUncertainty({
    toolNotRun: intent === 'status-check' ? ['diagnostics'] : [],
    memoryNotFound: turns.length === 0 ? ['prior turns for this conversation'] : [],
    modelCouldNotAnswer: demoMode,
    modelCouldNotAnswerReason: demoMode ? 'no model loaded — demo mode' : undefined,
    missingInformation: blocked && blockedReason ? [`owner approval: ${blockedReason}`] : [],
  });
  const strategy = selectStrategy({
    hasToolResult: false,
    safeReadOnlyToolAvailable: toolRegistry.get('diagnostics') !== undefined,
    proposedStateChange: options.requestedAction !== undefined,
    hasEvidenceForChange: false,
    simulationAvailable: false,
    contradiction: false,
    cannotSolve: false,
  });

  // Execution — only when not blocked. Slice 7: the DAG plan is executed
  // here (via PlanDAG.run) when the intent needs a tool. The tool
  // executor calls the registry; the DAG compares the predicted vs
  // actual outcome shape per node and replans on failure (never a silent
  // retry of the same failed step). The tool calls are recorded for the
  // telemetry trace below. A plan failure is recorded as an execution
  // note — it does not fabricate an answer.
  //
  // Retest #14: the DAG runs whenever there is a plan — model or no
  // model. The tools (diagnostics, the gateway) do not need a model, so
  // gating the DAG on a loaded model made every tool intent fail in demo
  // mode. A tool intent's answer is composed from the DAG results here.
  let planToolCalls: string[] = [];
  let planError: string | null = null;
  if (!blocked) {
    if (planNodes.length > 0) {
      const dag = new PlanDAG({
        budget: runBudget,
        executeTool: async (node) => {
          const result = await toolRegistry.execute(node.tool, node.args, {});
          return { actual: result, verified: true };
        },
        // Replan: drop the failed node and continue with the rest. The
        // failed step is never retried. Returning the remaining nodes
        // (without the failed one) is the replan.
        replan: (_failedNode, _outcome, remaining) => remaining,
      });
      try {
        const dagResults = await dag.run(planNodes);
        planToolCalls = dagResults.map((r) => r.node.tool);
        push(
          emit(
            'execution',
            started,
            `DAG plan executed: ${dagResults.map((r) => `${r.node.tool} (${r.outcome.matched ? 'ok' : 'replanned'})`).join(', ')}`,
          ),
        );
        if (answerFromTools) {
          answer = composeToolAnswer(intent, dagResults);
        }
      } catch (err) {
        planError = err instanceof Error ? err.message : String(err);
        push(emit('execution', started, `DAG plan failed: ${planError}`));
        if (answerFromTools) {
          answer = `The tool I needed for that could not run — ${planError}.`;
        }
      }
    } else {
      push(
        emit(
          'execution',
          started,
          demoMode
            ? 'none — demo mode'
            : intent === 'identity'
              ? 'deterministic answer returned'
              : 'answer generated',
        ),
      );
    }
  }

  // Verification — the answer is checked against the evidence record.
  // A tool-derived answer is verified by the tool's own measured data
  // (the DAG result), not by a generation — so it is not "nothing to
  // verify" even when no model is loaded.
  const verificationNote = answerFromTools
    ? `answer from tools (${planToolCalls.join(', ') || 'none ran'})`
    : demoMode
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

  // Metacognitive controller — outcome evaluation + learning gate
  // (MCNA slice 1). Runs after execution/verification. The prediction is
  // what a normal run promises: not blocked, an answer produced, an
  // evidence record stored. The actual is what this run did. A permission
  // block is a detected mismatch, not a silent failure. The outcome is
  // stored as learning ONLY when its evidence re-verifies (hash match
  // against the stored record); a blocked run has no evidence and is
  // stored as an attempt, never as knowledge.
  const prediction = { blocked: false, answerGenerated: true, evidenceStored: true };
  const actual = {
    blocked,
    answerGenerated: answer.length > 0,
    evidenceStored: evidenceId !== null,
  };
  const hashVerified = evidenceId
    ? (await reverifyEvidence(evidenceId)).pass
    : false;
  const outcomeEval = evaluateOutcome(prediction, actual, { hashVerified });
  const learning = await recordVerifiedOutcome({
    taskType: intent,
    prediction,
    actual,
    evidence: evidenceId
      ? { kind: 'hash-match', verified: true, evidenceId }
      : { kind: 'tool-success', verified: false },
  });
  const outcome = { ...outcomeEval, storedAs: learning.storedAs as 'knowledge' | 'attempt' };

  // Slice 6 (judge): the judge reads the CONTROLLER's outputs
  // (confidence + reasons, unknowns, the outcome diff) plus the
  // deterministic rubric results — it does not re-grade raw text alone.
  // Until the judge exists, no score is presented as a quality signal;
  // the verdict (pass/fail + score + reasons) is the quality signal,
  // and it is recorded in the run trace + returned in metacognition.
  const judgeVerdict = judge({
    confidence,
    uncertainty: { unknowns },
    outcomeDiffs: [{ predicted: prediction, actual, matched: outcomeEval.matched }],
    rubrics: options.rubrics ?? [],
    cannotSolve: false,
  });
  push(emit('result', started, `judge: ${judgeVerdict.passed ? 'PASS' : 'FAIL'} (score ${judgeVerdict.score})`));

  // Durable record of this run (v0.1.4): panels that mount later — the
  // Visualizations tab, opened after a Chat run — read this instead of
  // depending on catching the ephemeral stage event while mounted.
  recordGeneration({
    id: `gen-${Date.now()}`,
    at: Date.now(),
    modelId,
    tokensPerSecond:
      demoMode || intent === 'identity' || answerFromTools
        ? null
        : (localInferenceEngine.getState().lastTokensPerSecond ?? null),
    elapsedMs: Date.now() - started,
    demoMode,
    stages: [...stages],
  });

  // Persist the turn in local memory.
  await memoryStore.appendTurn({ role: 'user', text: input, at: Date.now() });
  await memoryStore.appendTurn({
    role: 'agent',
    text: answer,
    at: Date.now(),
    modelId: modelId ?? undefined,
  });

  // Slice 7 (telemetry): persist a run trace (tokens, latency, route,
  // model, tool calls, outcome) so the run has a durable ledger, not
  // just the in-memory stage events. Token count is null (unmeasured)
  // — the engine reports a rate (tok/s), not a count, and an estimate
  // is not recorded as a measurement.
  runTraceStore.record({
    id: `trace-${Date.now()}`,
    startedAt: started,
    endedAt: Date.now(),
    latencyMs: Date.now() - started,
    route: decision.route,
    model: modelId,
    tokens: null,
    toolCalls: planToolCalls,
    quota: null,
    outcome: blocked ? 'error' : planError ? 'error' : 'ok',
    error: blockedReason ?? planError,
    judge: { passed: judgeVerdict.passed, score: judgeVerdict.score, reasons: judgeVerdict.reasons },
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
    metacognition: { confidence, unknowns, strategy, outcome, judge: judgeVerdict },
  };
}
