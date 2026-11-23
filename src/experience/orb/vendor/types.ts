/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/nvknexusorb/types.ts
 * Recovered 2026-11-21 by the unification gap-fill pass; SHA not recorded in the report.
 * Do not simplify away: this file is the original implementation, kept verbatim
 * except for import-path fixes noted inline where the layout changed.
 */


export type PortalAnimationType = 'rebirth' | 'orb' | 'holographic' | 'starborn' | 'tech' | 'fractal' | 'keynote' | 'scroll' | 'random';

export type ActiveView = 'website' | 'rebirthProtocol' | 'codexOrbSystem' | 'fwtPaper' | 'keynote' | 'hqidPaper' | 'scrollLawPaper' | 'nvkTechPage' | 'starbornSynthesis' | 'embeddedWebsite' | 'nexusIntegrationSOP' | 'agentCommandCenter' | 'reasoningNexus' | 'omegaLogicCore';

export interface LoreEntry {
  definition: string;
  navigatesTo?: {
    view: ActiveView;
    animation: PortalAnimationType;
  };
}

export type LoreData = {
  [key:string]: LoreEntry;
};

export interface SlideContent {
  id: number;
  title: string;
  presenter: string;
  textLines: string[];
  dialogueLines: string[];
}

export interface ProjectCard {
  icon: string;
  title: string;
  tags: string[];
  description: string;
  link: string;
  isInternal?: boolean;
  animationType?: PortalAnimationType;
  openInNewTab?: boolean;
}

/**
 * v0.1.8 (2026-11-22): the orb's nodes are the Agent's own management
 * and system surfaces — NOT the legacy Nexus gateways (Vision / Codex /
 * Nexus / Lore) that were removed with their MythoTech project lists.
 * Each node opens a real panel that exists in this app. No node may
 * point at a page, project, or capability that does not exist.
 */
export interface AgentNode {
  id: 'agents' | 'evidence' | 'diagnostics' | 'system';
  title: string;
  description: string;
  /** The app panel this node opens (OrbPanel in OrbHost.tsx). */
  panel: 'agents' | 'evidence' | 'diagnostics' | 'settings';
}