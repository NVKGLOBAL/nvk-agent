/**
 * NVK Agent — first-screen hero content.
 *
 * The hero is the answer to "what is this and what can it do" without
 * scrolling. Every capability listed here MUST map to a registry entry that
 * is OPERATIONAL or PARTIAL — the test enforces it, so a capability that
 * regresses can never be advertised as working. Vision, web search, file
 * analysis and agent workflows are not implemented and are never listed.
 */
import type { OrbPanel } from './orb/OrbHost';

export interface HeroCapability {
  /** Registry id — must be OPERATIONAL or PARTIAL (enforced by test). */
  capabilityId: string;
  title: string;
  detail: string;
  panel: OrbPanel;
}

export const HERO_CAPABILITIES: HeroCapability[] = [
  {
    capabilityId: 'local-inference',
    title: 'Chat with a local AI model',
    detail: 'Runs on your device when a model is loaded; otherwise answers via the free cloud gateway (turn it off in Settings for local-only).',
    panel: 'chat',
  },
  {
    capabilityId: 'resonance-visualizer',
    title: 'Live visualizations',
    detail: 'Resonance field and knowledge graph, driven by real activity.',
    panel: 'visualizers',
  },
  {
    capabilityId: 'agent-spawn',
    title: 'Run small agents',
    detail: 'Agents that do a job and record their proof.',
    panel: 'agents',
  },
  {
    capabilityId: 'diagnostics',
    title: 'Diagnostics that tell the truth',
    detail: 'Model, adapter, storage and outbound checks — they can fail.',
    panel: 'diagnostics',
  },
];

export const EXAMPLE_PROMPTS: string[] = [
  'What is 2+2? Answer in one word.',
  'What can you do?',
  'Explain NVK in one sentence.',
];
