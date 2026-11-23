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

/**
 * Map a completed pipeline run to a resonance effect (v0.1.4). Pure
 * function so the mapping is testable: the panel seeds from stored
 * generation events on mount AND from live stage events while open — both
 * paths must build the same effect. Intensity is measured tok/s (capped
 * at 1); demo-mode runs carry no tok/s and read as source "demo mode".
 */
export function resonanceEffectFromGeneration(ev: {
  id: string;
  at: number;
  modelId: string | null;
  tokensPerSecond: number | null;
  elapsedMs: number;
  demoMode: boolean;
}): ResonanceEffect {
  return {
    id: `fx-${ev.id}`,
    source: ev.demoMode ? 'demo mode' : (ev.modelId ?? 'demo mode'),
    text: ev.demoMode
      ? 'Demo-mode result stored as evidence (no model loaded).'
      : 'Pipeline result stored as evidence.',
    time: new Date(ev.at).toLocaleTimeString(),
    intensity: Math.min(1, (ev.tokensPerSecond ?? 0) / 50),
    duration: `${(ev.elapsedMs / 1000).toFixed(1)}`,
    borderColorClass: 'border-emerald-400',
    textColorClass: 'text-emerald-300',
    valueColorClass: 'text-emerald-200',
    colorProfile: '#00FFB3',
  };
}
