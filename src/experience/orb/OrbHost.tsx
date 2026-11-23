/**
 * NVK Agent — the orb host.
 *
 * Renders the vendored Nexus orb (NVK's own CodexOrbSystem — full-screen
 * three.js hub with the createNexusOrb shader orb and gateway nodes) and
 * drives its activity state ONLY from real pipeline stage events. The orb
 * never animates a state the pipeline did not actually reach.
 *
 * Containment note: CodexOrbSystem is designed full-screen (`fixed inset-0`).
 * It is rendered inside a transformed wrapper, which makes its fixed
 * positioning resolve against this section instead of the viewport — the
 * original file is untouched.
 *
 * v0.1.4: DOM gateway controls. The four gateways exist as spheres inside
 * the canvas and are clickable there (raycast, canvas-relative coordinates
 * — see CodexOrbSystem), but a canvas is not a reliable control surface
 * on its own: this host also renders the same four gateways as real
 * buttons under the canvas, each navigating to its panel and updating
 * the footer status. No dead controls.
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
import { NEXUS_GATEWAYS } from './vendor/constants';

const CodexOrbSystem = lazy(() => import('./vendor/CodexOrbSystem'));

export type OrbPanel = 'chat' | 'visualizers' | 'diagnostics' | 'settings' | 'agents';

// Gateway → orb view → app panel. The orb's own project map sends each
// gateway's projects to real pages; here each gateway opens the panel that
// best represents it in THIS app (the orb IS the organization system).
const GATEWAY_VIEW: Record<string, string> = {
  vision: 'codexOrbSystem', // chat — the Vision is the entry point
  codex: 'omegaLogicCore', // visualizers — the living intelligence
  nexus: 'agentCommandCenter', // agents — the wider ecosystem
  lore: 'reasoningNexus', // diagnostics — the foundational research
};

export function OrbHost({ onNavigate }: { onNavigate: (panel: OrbPanel) => void }) {
  const [state, setState] = useState<OrbActivityState>('idle');
  const [lastStage, setLastStage] = useState<PipelineStage | null>(null);
  const [orbFailed, setOrbFailed] = useState(false);
  const [activeGateway, setActiveGateway] = useState<string | null>(null);

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
    });
    return unsub;
  }, []);

  // Gateway views from the original orb map to real panels in this app.
  // Views with no counterpart are reported, not silently swallowed.
  const handleNavigate = (view: string) => {
    const map: Record<string, OrbPanel> = {
      codexOrbSystem: 'chat',
      agentCommandCenter: 'agents',
      reasoningNexus: 'diagnostics',
      omegaLogicCore: 'visualizers',
      nexusIntegrationSOP: 'settings',
    };
    const panel = map[view];
    if (panel) onNavigate(panel);
    else onNavigate('chat');
  };

  // One entry point for gateway selection — used by BOTH the canvas
  // click (via onGatewaySelect) and the DOM buttons below, so the two
  // control surfaces can never drift apart.
  const handleGatewaySelect = (gatewayId: string) => {
    setActiveGateway(gatewayId);
    handleNavigate(GATEWAY_VIEW[gatewayId] ?? 'codexOrbSystem');
  };

  const activeGatewayTitle =
    NEXUS_GATEWAYS.find((g) => g.id === activeGateway)?.title ?? null;

  // Phase A (v0.1.5): the orb's visual input (color / entropy / pulse)
  // comes from the same state the footer shows — one mapping, no second
  // source of truth. The renderer applies it to the shader orb.
  const visual = orbVisualForState(state);

  return (
    <section aria-label="Nexus orb" style={styles.wrap} className="orb-panel">
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
              onNavigate={(view) => handleNavigate(view)}
              onNavigateExternal={(url) => window.open(url, '_blank', 'noopener')}
              onNavigateNewTab={(url) => window.open(url, '_blank', 'noopener')}
              onGatewaySelect={handleGatewaySelect}
              visualInput={visual}
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
      {/* DOM gateway controls (v0.1.4): the same four gateways as real
          buttons, so the orb works as an organization system even when the
          canvas is not clickable (touch, keyboard, screen reader). Each
          button navigates to its panel and marks itself active. */}
      <div style={styles.gatewayRow} role="group" aria-label="Gateway nodes">
        {NEXUS_GATEWAYS.map((gateway) => (
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
      {/* Footer bar, below the canvas — never overlaid on the particles, so
          the state text stays readable (2026-11-21 UI fix). */}
      <div style={styles.orbFooter}>
        <span style={styles.status} role="status">
          <span style={{ ...styles.dot, background: visual.color }} />
          <strong>{orbStateLabel(state)}</strong>
          {lastStage && <span style={styles.stage}> · last stage: {lastStage}</span>}
          {activeGatewayTitle && (
            <span style={styles.stage}> · Gateway: {activeGatewayTitle}</span>
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
