/**
 * NVK Agent — agent context file bridge (.sol / .memory via Vite `?raw`).
 *
 * This module is the ONLY place that imports the `.sol` / `.memory`
 * files. Vite bundles their contents into the app at build time, so the
 * text is guaranteed present — no runtime fetch, no dependence on the
 * host serving dotfiles (GitHub Pages runs Jekyll, which hides dotfiles
 * unless a `.nojekyll` is present — bundling sidesteps that entirely).
 *
 * DO NOT import this module from `pipeline.ts`, from any test, or from
 * any module the tests touch. The test runner (tsx) cannot resolve
 * Vite's `?raw` query — it tries to parse the text file as JavaScript
 * and fails (verified 2026-11-23). Only the browser entry (`main.tsx`)
 * imports this module, and the Vite build is the verification that the
 * `?raw` imports resolve: `npm run build` fails loudly if they do not,
 * and the built bundle must contain the soul/memory text (checked by
 * grepping `dist/` — see the note in
 * `~/workspace/nvk-unified/nvk-agent-sol-memory-2026-11-23.md`).
 *
 * The pure loading logic lives in `agent-context.ts` (no `?raw`, safe
 * under tsx). This module only supplies the bundled texts to it.
 */
import soulText from '../../.sol?raw';
import memoryText from '../../.memory?raw';
import {
  loadAgentContextFromTexts,
  type AgentContext,
} from './agent-context';
import { memoryStore } from './memory';

/**
 * Load the agent's soul + memory once at startup. Synchronous where it
 * matters: the singleton is populated before this returns, so any
 * pipeline run after boot sees the context. The small load record
 * persisted to the memory store (loaded time + char counts, not the
 * texts — they are already in the bundle) is fire-and-forget: a
 * storage failure must never break startup.
 */
export function loadAgentContext(): AgentContext {
  const ctx = loadAgentContextFromTexts(soulText, memoryText);
  void memoryStore
    .set('agent-context', {
      loadedAt: ctx.loadedAt,
      soulChars: ctx.soulChars,
      memoryChars: ctx.memoryChars,
    })
    .catch(() => {
      /* storage failure never breaks startup */
    });
  return ctx;
}
