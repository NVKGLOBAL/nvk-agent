/**
 * Local type definitions for the vendored CODEXA visualizers.
 *
 * The vendored components imported these from the CODEXA repo root
 * (`../types`). The root types.ts (45 KB) was not vendored; these shapes are
 * defined here from the fields the components actually read. Nothing here is
 * invented behavior — only the field names the code already uses.
 */
export interface ResonanceEffect {
  id: string;
  source: string;
  text: string;
  time: string;
  intensity: number;
  /** Seconds, as a string — the visualizer parses it with parseFloat. */
  duration: string;
  borderColorClass: string;
  textColorClass: string;
  valueColorClass: string;
  /** Particle color for bursts, e.g. '#00FFB3'. */
  colorProfile: string;
}

export interface ResonanceVisualizerPanelProps {
  effects: ResonanceEffect[];
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClearEffects: () => void;
}

export interface GlyphMutationNode {
  id: string;
  label: string;
  parentId?: string | string[];
  entropyLevel: number;
  traits: string[];
}

export interface Axiom {
  id: string;
  label: string;
  title: string;
  layer: string;
  series: string;
  resonanceFrequency: number;
}

export interface RewovenGlyph {
  id: string;
  baseGlyphId: string;
  boundAxiomKey: string;
  label?: string;
}
