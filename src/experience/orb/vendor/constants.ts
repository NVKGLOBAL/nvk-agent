/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/constants.ts (recovered 2026-11-21) +
 * NVKGLOBAL/NVK-AI-OS/components/CodexOrbSystem.tsx @ b723bc4d9.
 *
 * v0.1.8 (2026-11-22): this file used to carry the OS repo's legacy
 * orb content — SLIDES_DATA (keynote slides), allProjects (the
 * MythoTech project cards: keynote, omegaLogicCore, rebirthProtocol,
 * nvkTimeMachine, fwtPaper, …), NEXUS_GATEWAYS (The Vision / The Codex /
 * The Nexus / The Lore with their MythoTech descriptions) and LORE_DATA.
 * None of it was reachable from a real page in this app, and the owner
 * directed (2026-11-22) that the legacy links be removed and the orb
 * nodes rebuilt as agent management / system information. All four
 * legacy exports were deleted here; their content survives in the repo
 * history (GitHub main). What remains is the Agent's own node list:
 * four nodes, each opening a real panel.
 */

import type { AgentNode } from './types';

/**
 * The orb's nodes (v0.1.8). Agents manage the agent swarm; Evidence is
 * the proof store; Diagnostics is the real-check page; System is model,
 * provider, cloud and storage settings. Chat and Visualizations stay in
 * the nav tabs — they are not orb nodes.
 */
export const NVK_AGENT_NODES: AgentNode[] = [
  {
    id: 'agents',
    title: 'Agents',
    description: 'Spawned agents — their census, runs and results.',
    panel: 'agents',
  },
  {
    id: 'evidence',
    title: 'Evidence',
    description: 'Verified outputs with hashes — proof of what the agent did.',
    panel: 'evidence',
  },
  {
    id: 'diagnostics',
    title: 'Diagnostics',
    description: 'Real checks — model, adapter, storage, outbound — that can fail.',
    panel: 'diagnostics',
  },
  {
    id: 'system',
    title: 'System',
    description: 'Model, providers, cloud toggle and storage.',
    panel: 'settings',
  },
];
