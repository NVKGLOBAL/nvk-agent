/**
 * VENDORED — NVK's own code, preserved as an asset (Unification Directive).
 * Source: NVKGLOBAL/NVK-AI-OS/types.ts @ b723bc4d9 (2026-09-21).
 *
 * v0.1.6 (Phase B — orb renderer swap, 2026-11-22): only the types the
 * orb renderer needs were ported — the four enums the orb + particle
 * systems switch on, plus CodexModeDefinition (the preset shape in
 * vendor/CodexModes.ts). The rest of the OS types file (ClusterNode,
 * Cluster, SubAgent, ThoughtGlyph, PanelDefinition, NodeInfo, Axiom,
 * ritual/threadcoil/blood-ink types, ...) is cluster/panel/ritual
 * machinery: Phase C or never. It was NOT ported, and nothing in this
 * app should re-create it by hand — when Phase C lands, port it from
 * the same source file.
 *
 * The enums are copied verbatim, including their string values.
 */
export enum OrbMode {
  HolographicCore = 'Holographic Core',
  CrystallineMatrix = 'Crystalline Matrix',
  EntropicStorm = 'Entropic Storm',
  ChaoticNucleus = 'Chaotic Nucleus',
  AethericWeave = 'Aetheric Weave',
  StarlightConductor = 'Starlight Conductor',
  VoidShell = 'Void Shell',
  BioLattice = 'Bio Lattice',
  ResonantSpire = 'Resonant Spire',
  TemporalRift = 'Temporal Rift',
  PhotoGallery = 'Photo Gallery'
}

export enum CodexModeId {
  ORIGIN_STATE = 'ORIGIN_STATE',
  REFLECTION_MODE = 'REFLECTION_MODE',
  SYNTHESIS_MODE = 'SYNTHESIS_MODE',
  SYMBIOTIC_WEAVE = 'SYMBIOTIC_WEAVE',
  VEIL_MODE = 'VEIL_MODE',
  TARDIS_SYNCHRONICITY = 'TARDIS_SYNCHRONICITY',
  FLAME_CORE = 'FLAME_CORE',
  GLYPH_ATLAS_VIEWER = 'GLYPH_ATLAS_VIEWER',
  OMNI_VISUAL_MODE = 'OMNI_VISUAL_MODE',
  COMMUNION_MODE = 'COMMUNION_MODE',
  KINDNESS_MODE = 'KINDNESS_MODE',
  HARMONIC_SCRIBE = 'HARMONIC_SCRIBE',
  NEURAL_LATTICE = 'NEURAL_LATTICE',
  AXIOM_ORCHARD = 'AXIOM_ORCHARD',
  AUTONOMOUS_SEEKER = 'AUTONOMOUS_SEEKER'
}

export enum PanelLayout {
  SPATIAL_ORBIT = 'SPATIAL_ORBIT',
  GRID_MATRIX = 'GRID_MATRIX',
  LATTICE_MESH = 'LATTICE_MESH',
  CCTV_ARRAY = 'CCTV_ARRAY',
  TOPOLOGY_MESH = 'TOPOLOGY_MESH',
  SEARCH_NEXUS = 'SEARCH_NEXUS',
  FOCUS_PRIMARY = 'FOCUS_PRIMARY',
  TAB_BROWSER = 'TAB_BROWSER'
}

export enum ParticleBackgroundMode {
  Orbital = 'Orbital',
  Galaxy = 'Galaxy',
  Stardust = 'Stardust',
  Wormhole = 'Wormhole',
  CosmicWeb = 'Cosmic Web',
  NeutrinoStream = 'Neutrino Stream',
  QuantumFoam = 'Quantum Foam',
  NebulaCloud = 'Nebula Cloud',
  SupernovaRemnant = 'Supernova Remnant',
  AetherFlow = 'Aether Flow',
  None = 'None'
}

export type CodexModeDefinition = {
  id: CodexModeId;
  name: string;
  quote: string;
  description: string;
  icon: string;
  entropySettings?: {
    targetEntropy?: number;
    minEntropy?: number;
    maxEntropy?: number;
    capEffectiveEntropyAt?: number;
    lockMasterOverride?: boolean;
  };
  negentropyTarget?: {
    level: number;
    isStable: boolean;
  };
  primaryVisualizerFocus?: string;
  themeKey?: string;
  agentBehaviorOverrides?: {
    autoEchoActivationLevel?: 'off' | 'reduced' | 'normal' | 'heightened';
  };
};
