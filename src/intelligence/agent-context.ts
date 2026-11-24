/**
 * NVK Agent — agent context (.sol / .memory).
 *
 * The agent's soul and memory live in two plain-text files at the repo
 * root — `.sol` (who the agent is) and `.memory` (what it knows) — and
 * are loaded once at startup into this module's singleton, so the
 * intelligence pipeline can use them (see the context stage in
 * `pipeline.ts`, which reports the load).
 *
 * This module is deliberately pure: it contains NO `?raw` import and no
 * Node or browser API. The `?raw` imports live in the sibling module
 * `agent-context-files.ts`, which the browser entry (`main.tsx`) loads.
 * The split exists because the test runner (tsx) cannot resolve Vite's
 * `?raw` query — verified 2026-11-23: tsx tries to parse the imported
 * text file as JavaScript and fails — while Vite bundles it fine. So:
 * tests import THIS module and pass file contents read with `fs`
 * (see `tests/capability-registry.test.ts`); the app imports the
 * `-files` module, which calls the loader here.
 *
 * Boundaries, learned the hard way (identity fix, 2026-11-23):
 * - The per-generation system prompt stays EXACTLY the three short
 *   sentences in `AGENT_SYSTEM_PROMPT` (`inference.ts`). Nothing in
 *   these files is ever injected into a generation prompt: the first
 *   four-sentence draft of the system prompt broke the validated 2+2
 *   path (the model echoed the prompt instead of answering).
 * - The identity facts here must agree with `AGENT_SYSTEM_PROMPT` and
 *   `IDENTITY_ANSWER` (`pipeline.ts`). The agreement is enforced by a
 *   test, not by derivation — deriving the exact validated sentences
 *   from prose at runtime would be fragile, and a drifted derivation
 *   would silently change the generation path.
 */

export interface AgentContext {
  /** Full text of `.sol` — who the agent is. */
  soul: string;
  /** Full text of `.memory` — what the agent knows. */
  memory: string;
  /** Char counts, used by the pipeline context stage note. */
  soulChars: number;
  memoryChars: number;
  /** When the context was loaded (Date.now()). */
  loadedAt: number;
}

/**
 * The identity facts that `.sol`, `.memory`, `AGENT_SYSTEM_PROMPT`, and
 * `IDENTITY_ANSWER` must all carry. Two layers, never mixed up: NVK is
 * the product (Nevik Elmo, NVK Global); Qwen1.5-0.5B-Chat is the model
 * (Alibaba). The agreement test asserts every fact string appears in
 * all four places.
 */
export const IDENTITY_FACTS = [
  'Nevik Elmo',
  'NVK Global',
  'Qwen1.5-0.5B-Chat',
  'Alibaba',
] as const;

let loaded: AgentContext | null = null;

/**
 * Validate and load agent context from the raw file texts. Pure and
 * synchronous: the texts are already in memory (bundled by Vite in the
 * browser, read with `fs` in tests). Throws on empty input — a missing
 * or empty soul/memory file is a broken build, not a silent default.
 */
export function loadAgentContextFromTexts(
  soulText: string,
  memoryText: string,
): AgentContext {
  const soul = soulText.trim();
  const memory = memoryText.trim();
  if (!soul) throw new Error('Agent context: .sol is empty — the soul file is missing or blank.');
  if (!memory) {
    throw new Error('Agent context: .memory is empty — the memory file is missing or blank.');
  }
  loaded = {
    soul,
    memory,
    soulChars: soul.length,
    memoryChars: memory.length,
    loadedAt: Date.now(),
  };
  return loaded;
}

/** The loaded context, or null when startup has not loaded it yet. */
export function getAgentContext(): AgentContext | null {
  return loaded;
}

export function isAgentContextLoaded(): boolean {
  return loaded !== null;
}

/** Short note for the pipeline context stage — counts only, never content. */
export function agentContextNote(): string {
  if (!loaded) return 'agent context not loaded';
  return `agent context loaded (.sol ${loaded.soulChars} chars, .memory ${loaded.memoryChars} chars)`;
}

/** Do both texts carry every identity fact? Used by the agreement test. */
export function contextContainsIdentityFacts(ctx: AgentContext): boolean {
  return IDENTITY_FACTS.every(
    (fact) => ctx.soul.includes(fact) && ctx.memory.includes(fact),
  );
}
