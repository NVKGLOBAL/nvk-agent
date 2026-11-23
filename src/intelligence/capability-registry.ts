/**
 * NVK Agent — capability registry.
 *
 * Unification Directive §1: every capability is classified with evidence.
 *   OPERATIONAL   — verified working, evidence on file.
 *   PARTIAL       — works in part; the gap is named.
 *   DISCONNECTED  — built but not wired to a live dependency.
 *   SIMULATED     — looks like it works but does not (never shipped as real).
 *   BROKEN        — was working, now fails; the failure is named.
 *   MISSING       — no implementation exists.
 *   BLOCKED       — cannot proceed; the blocker is named.
 *
 * Rule: nothing is OPERATIONAL without evidence. A status change requires a
 * passing test or a verified run, never a claim.
 */
export type CapabilityStatus =
  | 'OPERATIONAL'
  | 'PARTIAL'
  | 'DISCONNECTED'
  | 'SIMULATED'
  | 'BROKEN'
  | 'MISSING'
  | 'BLOCKED';

export interface Capability {
  id: string;
  name: string;
  layer: 'Experience' | 'Intelligence' | 'Sovereign Infrastructure';
  status: CapabilityStatus;
  /** What the status rests on — a test, a run, a file, or the honest gap. */
  evidence: string;
  lastVerified: string | null;
  notes?: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'local-inference',
    name: 'Local inference (Transformers.js, in-browser)',
    layer: 'Intelligence',
    status: 'PARTIAL',
    evidence:
      'Engine loads real models from the Hugging Face hub and generates real text. Node validation passed (milestone-10, 2026-11-21), including through the engine path (test:milestone-10-engine). Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): chat answered "The sum of 2 and 2 is equal to four."; Diagnostics 6/6 PASS. PARTIAL until the phone run passes — the iPhone crash at 100% load (2026-11-21) is still unresolved.',
    lastVerified: '2026-11-22',
    notes: 'Default model Xenova/Qwen1.5-0.5B-Chat. No smaller model that answers 2+2 was found (SmolLM 401, Flan-77M fails, distilgpt2 counts). Browser cache ON; WASM threads capped to 2 on low-memory devices; honest low-memory warning before download.',
  },
  {
    id: 'milestone-10-validation',
    name: 'Milestone-10 validation test (2+2 → 4)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'PASSED 2026-11-21 in Node on this VM: Qwen1.5-0.5B-Chat loaded in 6.0s (cached), answered "Two plus two equals four." in 2,976 ms (~1.7 tok/s). Also passed through the engine path the same day (test:milestone-10-engine, browser chat defaults). Full log in docs/MILESTONE-10.md. Browser end-to-end PASSED 2026-11-22 (retest #3, v0.1.3 live): "The sum of 2 and 2 is equal to four.", Diagnostics 6/6 PASS.',
    lastVerified: '2026-11-22',
    notes: 'Earlier browser run FAILED pre-fix 2026-11-21 14:04 PT (empty replies, template bug — fixed the same day, see docs/MILESTONE-10.md). Flan-T5-248M failed this test in five prompt shapes (see docs/MILESTONE-10.md).',
  },
  {
    id: 'agent-pipeline',
    name: 'Agent pipeline (11 stages, input → verified result)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/pipeline.ts implements all 11 stages with real stage events, timing, and evidence records.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'capability-registry',
    name: 'Capability registry (this file)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence: 'Registry loads; tests assert no OPERATIONAL entry lacks evidence.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'permission-gate',
    name: 'Permission gate (explicit authorization)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/permissions.ts denies financial / payment / publishing / destructive / external-account actions unless the owner approves them in the session.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'memory',
    name: 'Local-first memory (conversations, facts, evidence refs)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/memory.ts persists to IndexedDB with a localStorage fallback; no data leaves the device.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics (real checks, pass/fail)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/diagnostics.ts measures model state, adapter, counted outbound requests, and storage. It can report FAIL.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'settings',
    name: 'System Settings (models, providers, cloud toggle)',
    layer: 'Experience',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/settings.ts: cloud toggle OFF by default, provider keys session-only by default, model management present.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'agent-spawn',
    name: 'Agent spawn (sub-agent registry + run + result)',
    layer: 'Intelligence',
    status: 'OPERATIONAL',
    evidence:
      'src/intelligence/agents.ts: spawn registers the agent, runs it through the pipeline, records the result and evidence. Built, not a form.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'nexus-orb',
    name: 'Nexus orb (3D, real activity states)',
    layer: 'Experience',
    status: 'OPERATIONAL',
    evidence:
      'Renderer swapped in v0.1.6 (Phase B): NVK-AI-OS CodexOrbSystem port (NVKGLOBAL/NVK-AI-OS @ b723bc4d9), 11 orb modes + 11 particle modes, behind the Phase A OrbVisualInput interface. Orb states are driven only by real pipeline state. 41/41 tests pass, tsc clean, build succeeds; the live-browser check comes after deploy, as before.',
    lastVerified: '2026-11-22',
  },
  {
    id: 'resonance-visualizer',
    name: 'Resonance visualizer (live 3D resonance display)',
    layer: 'Experience',
    status: 'OPERATIONAL',
    evidence:
      'Vendored from NVKGLOBAL/-CODEXA components/ResonanceVisualizerPanel.tsx. Renders real particle bursts per generation event.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'knowledge-graph',
    name: 'Knowledge graph (EmergentLogicWeb)',
    layer: 'Experience',
    status: 'OPERATIONAL',
    evidence:
      'Vendored from NVKGLOBAL/-CODEXA components/EmergentLogicWeb.tsx. Force-directed 3D graph, data-driven.',
    lastVerified: '2026-11-21',
  },
  {
    id: 'cloud-gemini',
    name: 'Cloud provider — Gemini (opt-in only)',
    layer: 'Intelligence',
    status: 'BLOCKED',
    evidence: 'No API key configured and cloud is OFF by default. Blocked on owner opt-in + key.',
    lastVerified: null,
    notes: 'When enabled, requests leave the device — stated plainly in the UI.',
  },
  {
    id: 'cloud-openai',
    name: 'Cloud provider — OpenAI (opt-in only)',
    layer: 'Intelligence',
    status: 'BLOCKED',
    evidence: 'No API key configured and cloud is OFF by default. Blocked on owner opt-in + key.',
    lastVerified: null,
  },
  {
    id: 'payments',
    name: 'Payments / checkout (CODEXA $20/mo billing)',
    layer: 'Sovereign Infrastructure',
    status: 'MISSING',
    evidence:
      'No payment provider is wired. CODEXA pricing (1 week free, then $20/mo) is decided; the checkout is not built.',
    lastVerified: null,
  },
  {
    id: 'wallet-chain',
    name: 'Wallet / chain / explorer',
    layer: 'Sovereign Infrastructure',
    status: 'MISSING',
    evidence:
      'No wallet or explorer code exists in any NVK repo (verified in the unification inventory). Not claimed anywhere.',
    lastVerified: null,
  },
  {
    id: 'publishing',
    name: 'Publishing to external accounts (social, stores)',
    layer: 'Sovereign Infrastructure',
    status: 'BLOCKED',
    evidence:
      'No destination is wired and publishing requires explicit owner authorization per action. Blocked on both.',
    lastVerified: null,
  },
  {
    id: 'evidence-store',
    name: 'Evidence store (verified outputs, hashes)',
    layer: 'Sovereign Infrastructure',
    status: 'OPERATIONAL',
    evidence:
      'src/sovereign/evidence.ts records pipeline evidence with content hashes; re-verify recomputes and reports pass/fail.',
    lastVerified: '2026-11-21',
  },
];

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function capabilitiesByStatus(status: CapabilityStatus): Capability[] {
  return CAPABILITIES.filter((c) => c.status === status);
}

/** The registry's own honesty check: no OPERATIONAL entry without evidence. */
export function registrySelfCheck(): { ok: boolean; violations: string[] } {
  const violations = CAPABILITIES.filter(
    (c) => c.status === 'OPERATIONAL' && !c.evidence.trim(),
  ).map((c) => `${c.id}: OPERATIONAL without evidence`);
  return { ok: violations.length === 0, violations };
}
