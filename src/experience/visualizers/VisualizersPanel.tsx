/**
 * NVK Agent — visualizers panel.
 *
 * The visualizations are the representation of the AI and the user — the
 * next generation beyond Muse and other AIs. Both visualizers here are fed
 * REAL data:
 *   - ResonanceVisualizerPanel: one ResonanceEffect per completed pipeline
 *     generation (source = the model, intensity = measured tok/s).
 *   - EmergentLogicWeb: the capability registry as axioms, the 11 pipeline
 *     stages as glyph nodes (entropy = share of the last run's stage time).
 *     Resonance frequency is 0.0 Hz everywhere — unmeasured, labelled so.
 */
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { subscribeToStages, getGenerationEvents } from '../../intelligence/pipeline';
import { localInferenceEngine } from '../../intelligence/inference';
import { CAPABILITIES } from '../../intelligence/capability-registry';
import type { ResonanceEffect } from './types';
import { resonanceEffectFromGeneration } from './types';
import type { GlyphMutationNode, Axiom } from './types';

const ResonanceVisualizerPanel = lazy(() =>
  import('./ResonanceVisualizerPanel').then((m) => ({
    default: m.ResonanceVisualizerPanel,
  })),
);
const EmergentLogicWeb = lazy(() => import('./EmergentLogicWeb'));

export function VisualizersPanel() {
  const [effects, setEffects] = useState<ResonanceEffect[]>([]);
  const [playing, setPlaying] = useState(true);
  const [glyphs, setGlyphs] = useState<GlyphMutationNode[]>([]);
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(960);

  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const measure = () => setGraphWidth(Math.max(320, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Seed from runs that already happened (v0.1.4): stage events are
    // ephemeral — a generation run from Chat, before this tab was opened,
    // used to leave the panel saying "No generation events yet" even
    // though the run had happened. The pipeline keeps the last 20 runs;
    // this tab reads them on mount, then subscribes for new ones.
    const past = getGenerationEvents();
    if (past.length > 0) {
      setEffects(past.map((ev) => resonanceEffectFromGeneration(ev)));
      const latest = past[past.length - 1];
      setGlyphs(
        latest.stages.map((s) => ({
          id: `stage-${s.stage}`,
          label: s.stage,
          entropyLevel: Math.min(1, s.elapsedMs / Math.max(1, latest.elapsedMs)),
          traits: [s.stage],
        })),
      );
    }
    const unsub = subscribeToStages((event) => {
      if (event.stage === 'result') {
        const engine = localInferenceEngine.getState();
        const effect: ResonanceEffect = {
          id: `fx-${Date.now()}`,
          source: engine.activeModelId ?? 'demo mode',
          text: 'Pipeline result stored as evidence.',
          time: new Date().toLocaleTimeString(),
          intensity: Math.min(1, (engine.lastTokensPerSecond ?? 0) / 50),
          duration: `${(event.elapsedMs / 1000).toFixed(1)}`,
          borderColorClass: 'border-emerald-400',
          textColorClass: 'text-emerald-300',
          valueColorClass: 'text-emerald-200',
          colorProfile: '#00FFB3',
        };
        setEffects((prev) => [...prev.slice(-19), effect]);
      }
      // Glyph nodes: pipeline stages, entropy = elapsed share of this run.
      setGlyphs((prev) => {
        const total = Math.max(1, event.elapsedMs);
        const node: GlyphMutationNode = {
          id: `stage-${event.stage}`,
          label: event.stage,
          entropyLevel: Math.min(1, event.elapsedMs / total),
          traits: [event.stage],
        };
        const rest = prev.filter((g) => g.id !== node.id);
        return [...rest, node];
      });
    });
    return unsub;
  }, []);

  const axioms: Axiom[] = CAPABILITIES.map((c) => ({
    id: c.id,
    label: c.name,
    title: c.name,
    layer: c.layer,
    series: c.status,
    resonanceFrequency: 0, // unmeasured — the graph does not invent frequencies
  }));

  return (
    <div style={styles.wrap}>
      <h2>Visualizations — the face of the agent</h2>
      <p style={styles.small}>
        The orb and these visualizers are how the AI and the user see each
        other. Every animation here is driven by real pipeline activity.
      </p>
      <section style={styles.section}>
        <h3>Resonance field</h3>
        <Suspense fallback={<p>Loading visualizer…</p>}>
          <ResonanceVisualizerPanel
            effects={effects}
            isPlaying={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            onClearEffects={() => setEffects([])}
          />
        </Suspense>
        {effects.length === 0 && (
          <p style={styles.small}>
            No generation events yet — run the agent and resonance effects will
            appear here.
          </p>
        )}
      </section>
      <section style={styles.section}>
        <h3>Capability knowledge graph</h3>
        <p style={styles.small}>
          Nodes are the real capability registry (axioms) and pipeline stages
          (glyphs). Frequencies read 0.0 Hz until a real measurement exists.
        </p>
        <div style={styles.graph} ref={graphRef}>
          <Suspense fallback={<p>Loading graph…</p>}>
            <EmergentLogicWeb
              glyphNodesData={glyphs}
              axiomsData={axioms}
              rewovenGlyphsData={[]}
              width={graphWidth}
              height={480}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { border: '1px solid #1d2b3a', borderRadius: 12, padding: 14 },
  graph: { height: 480, position: 'relative' },
  small: { fontSize: 13, color: '#8fa3b8' },
};
