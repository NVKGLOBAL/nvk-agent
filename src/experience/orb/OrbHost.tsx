/**
 * NVK Agent — the orb host.
 *
 * Renders the vendored NVK orb (NVK's own CodexOrbSystem — full-screen
 * three.js hub with the createNexusOrb shader orb and gateway nodes) and
 * drives its activity state ONLY from real pipeline stage events. The orb
 * never animates a state the pipeline did not actually reach.
 *
 * Containment note: CodexOrbSystem is designed full-screen (`fixed inset-0`).
 * It is rendered inside a transformed wrapper, which makes its fixed
 * positioning resolve against this section instead of the viewport — the
 * original file is untouched.
 *
 * v0.1.4: DOM node controls. The four nodes exist as spheres inside
 * the canvas and are clickable there (raycast, canvas-relative coordinates
 * — see CodexOrbSystem), but a canvas is not a reliable control surface
 * on its own: this host also renders the same four nodes as real
 * buttons under the canvas, each navigating to its panel and updating
 * the footer status. No dead controls.
 *
 * v0.1.8: the nodes are Agents / Evidence / Diagnostics / System —
 * the Agent's own management and system surfaces. The legacy Nexus
 * gateways (Vision / Codex / Nexus / Lore) and their MythoTech project
 * lists were removed on the owner's direction; each node carries the
 * panel it opens, so the host no longer maps legacy view names.
 *
 * v0.1.5 (Phase A — state discipline): the orb's visual input (color /
 * entropy / pulse, from orb-state.ts) is passed into the renderer as
 * `visualInput`, so the shader orb itself — not just the footer dot —
 * shows the real state. The 4-second return-to-idle timer was removed:
 * a timer is not a pipeline event.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { subscribeToStages, PipelineStage } from '../../intelligence/pipeline';
import {
  orbStateForStageEvent,
  orbStateLabel,
  orbVisualForState,
  OrbActivityState,
} from './orb-state';
import { shouldFlareOnStageEvent } from './orb-life';
import { NVK_AGENT_NODES } from './vendor/constants';
import { OrbMode } from './vendor/osTypes';

const CodexOrbSystem = lazy(() => import('./vendor/CodexOrbSystem'));

export type OrbPanel = 'chat' | 'visualizers' | 'diagnostics' | 'settings' | 'agents' | 'evidence';

// Node → panel. Each node in NVK_AGENT_NODES carries the panel it
// opens; there is no legacy view-name mapping anymore (v0.1.8).

export function OrbHost({ onNavigate }: { onNavigate: (panel: OrbPanel) => void }) {
  const [state, setState] = useState<OrbActivityState>('idle');
  const [lastStage, setLastStage] = useState<PipelineStage | null>(null);
  const [orbFailed, setOrbFailed] = useState(false);
  const [activeGateway, setActiveGateway] = useState<string | null>(null);
  // v0.1.9: flare signal — a monotonically increasing count of real
  // pipeline completions. The renderer turns each increment into one
  // flare pulse that decays in its animation loop. It is an event
  // edge, not a state: it never moves the orb state, and it is never
  // driven by a timer.
  const [flareSignal, setFlareSignal] = useState(0);
  // 2026-11-27: orb mode selector. The renderer defines 11 OrbModes
  // and rebuilds its mode objects when the orbMode prop changes
  // (CodexOrbSystem mode effect); the host owns the selected mode and
  // passes it down. Default HolographicCore — the verified look.
  // Particle mode stays Galaxy (the default) until a preset wires it.
  const [orbMode, setOrbMode] = useState<OrbMode>(OrbMode.HolographicCore);

  // Phase A (v0.1.5): the ONLY thing that moves the orb is a real stage
  // event. The 4-second return-to-idle timeout that lived here in v0.1.4
  // was a timer-driven transition — the orb showed 'idle' with no event
  // behind it. Removed: the last real state now stands until the next
  // real stage event arrives. A denied permission shows 'blocked' via
  // orbStateForStageEvent (the permission event's DENIED note).
  useEffect(() => {
    const unsub = subscribeToStages((event) => {
      setLastStage(event.stage);
      setState(orbStateForStageEvent(event));
      // v0.1.9: a real pipeline completion fires the orb flare
      // (orb-life.ts). One increment per 'result' stage event.
      if (shouldFlareOnStageEvent(event)) {
        setFlareSignal((n) => n + 1);
      }
    });
    return unsub;
  }, []);

  // One entry point for node selection — used by BOTH the canvas
  // click (via onGatewaySelect) and the DOM buttons below, so the two
  // control surfaces can never drift apart. The node carries its panel.
  const handleGatewaySelect = (nodeId: string) => {
    const node = NVK_AGENT_NODES.find((n) => n.id === nodeId);
    if (!node) return;
    setActiveGateway(node.id);
    onNavigate(node.panel);
  };

  const activeGatewayTitle =
    NVK_AGENT_NODES.find((g) => g.id === activeGateway)?.title ?? null;

  // Phase A (v0.1.5): the orb's visual input (color / entropy / pulse)
  // comes from the same state the footer shows — one mapping, no second
  // source of truth. The renderer applies it to the shader orb.
  const visual = orbVisualForState(state);

  return (
    <section aria-label="NVK" style={styles.wrap} className="orb-panel">
      <div style={styles.contain} className="orb-canvas">
        <Suspense
          fallback={
            <div style={styles.loading}>
              <div style={styles.fallbackOrb} aria-hidden />
              <p>Orb loading… (three.js scene mounting)</p>
            </div>
          }
        >
          <ErrorBoundary onError={() => setOrbFailed(true)}>
            <CodexOrbSystem
              onGatewaySelect={handleGatewaySelect}
              visualInput={visual}
              flareSignal={flareSignal}
              orbMode={orbMode}
            />
          </ErrorBoundary>
        </Suspense>
      </div>
      {orbFailed && (
        <div style={styles.failed} role="alert">
          Orb failed to mount. The chat below still works — the orb is a view,
          not the intelligence.
        </div>
      )}
      {/* DOM node controls (v0.1.4, nodes rebuilt v0.1.8): the same four
          nodes as real buttons, so the orb works as an organization
          system even when the canvas is not clickable (touch, keyboard,
          screen reader). Each button navigates to its panel and marks
          itself active. */}
      <div style={styles.gatewayRow} role="group" aria-label="System nodes">
        {NVK_AGENT_NODES.map((gateway) => (
          <button
            key={gateway.id}
            type="button"
            aria-pressed={activeGateway === gateway.id}
            onClick={() => handleGatewaySelect(gateway.id)}
            style={{
              ...styles.gatewayButton,
              ...(activeGateway === gateway.id ? styles.gatewayButtonActive : {}),
            }}
            title={gateway.description}
          >
            {gateway.title.toUpperCase()}
          </button>
        ))}
      </div>
      {/* Orb mode selector (2026-11-27): the 11 OrbModes the renderer
          defines, as real buttons. Switching changes the mode objects
          the renderer builds; Holographic Core is the verified default.
          Visual confirmation of the non-default modes needs a live
          browser check after deploy — the modes are defined, not all
          live-verified. */}
      <div style={styles.modeRow} role="group" aria-label="Orb mode">
        <span style={styles.modeLabel}>Orb mode:</span>
        {Object.values(OrbMode).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={orbMode === mode}
            onClick={() => setOrbMode(mode)}
            style={{
              ...styles.gatewayButton,
              ...(orbMode === mode ? styles.gatewayButtonActive : {}),
            }}
            title={`Orb mode ${mode}`}
          >
            {mode}
          </button>
        ))}
      </div>
      {/* Footer bar, below the canvas — never overlaid on the particles, so
          the state text stays readable (2026-11-21 UI fix). */}
      <div style={styles.orbFooter}>
        <span style={styles.status} role="status">
          <span style={{ ...styles.dot, background: visual.color }} />
          <strong>{orbStateLabel(state)}</strong>
          {lastStage && <span style={styles.stage}> · last stage: {lastStage}</span>}
          {activeGatewayTitle && (
            <span style={styles.stage}> · Node: {activeGatewayTitle}</span>
          )}
        </span>
        <span style={styles.note}>
          The orb shows only real pipeline states. It never pretends to think.
        </span>
      </div>
    </section>
  );
}

function ErrorBoundary({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (failed) onError();
  }, [failed, onError]);
  if (failed) return null;
  try {
    return <>{children}</>;
  } catch {
    setFailed(true);
    return null;
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    border: '1px solid #1d2b3a',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#050608',
  },
  // transform creates a containing block for the orb's `fixed inset-0` root.
  // Height comes from .orb-canvas in index.css (340px phones, 520px desktop).
  contain: { position: 'relative', transform: 'translateZ(0)' },
  loading: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: '#8fa3b8',
  },
  fallbackOrb: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: '2px solid rgba(0,229,255,0.5)',
    boxShadow: '0 0 40px rgba(0,229,255,0.25) inset',
  },
  failed: {
    padding: 12,
    background: '#2a1214',
    color: '#ffb3b3',
    fontSize: 14,
  },
  orbFooter: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px 16px',
    padding: '10px 16px',
    borderTop: '1px solid #1d2b3a',
    background: '#070b10',
    fontSize: 13,
  },
  gatewayRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid #1d2b3a',
    background: '#070b10',
  },
  gatewayButton: {
    flex: '1 1 auto',
    background: '#0a121c',
    color: '#9fc6e8',
    border: '1px solid #2a3b4d',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  gatewayButtonActive: {
    background: '#0d2b3d',
    color: '#00e5ff',
    borderColor: '#00e5ff',
  },
  modeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid #1d2b3a',
    background: '#070b10',
  },
  modeLabel: { fontSize: 13, color: '#8fa3b8' },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  stage: { color: '#8fa3b8' },
  note: { fontSize: 12, color: '#8fa3b8' },
};
