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
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { subscribeToStages, PipelineStage } from '../../intelligence/pipeline';
import {
  orbStateForStage,
  orbStateLabel,
  OrbActivityState,
} from './orb-state';

const CodexOrbSystem = lazy(() => import('./vendor/CodexOrbSystem'));

export type OrbPanel = 'chat' | 'visualizers' | 'diagnostics' | 'settings' | 'agents';

export function OrbHost({ onNavigate }: { onNavigate: (panel: OrbPanel) => void }) {
  const [state, setState] = useState<OrbActivityState>('idle');
  const [lastStage, setLastStage] = useState<PipelineStage | null>(null);
  const [orbFailed, setOrbFailed] = useState(false);

  useEffect(() => {
    const unsub = subscribeToStages((event) => {
      setLastStage(event.stage);
      if (event.stage === 'result') {
        setState('complete');
        window.setTimeout(() => setState('idle'), 4000);
      } else {
        setState(orbStateForStage(event.stage));
      }
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

  return (
    <section aria-label="Nexus orb" style={styles.wrap}>
      <div style={styles.contain}>
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
      <div style={styles.status} role="status">
        <span style={{ ...styles.dot, background: stateColor(state) }} />
        <strong>{orbStateLabel(state)}</strong>
        {lastStage && <span style={styles.stage}> · last stage: {lastStage}</span>}
      </div>
      <p style={styles.note}>
        The orb shows only real pipeline states. It never pretends to think.
      </p>
    </section>
  );
}

function stateColor(state: OrbActivityState): string {
  switch (state) {
    case 'blocked':
      return '#ff5a5a';
    case 'complete':
      return '#3dff9e';
    case 'thinking':
    case 'planning':
      return '#ffd166';
    case 'executing':
    case 'verifying':
      return '#00e5ff';
    default:
      return '#8fa3b8';
  }
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
  contain: { position: 'relative', height: 520, transform: 'translateZ(0)' },
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
  status: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    zIndex: 20,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  stage: { color: '#8fa3b8' },
  note: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    margin: 0,
    fontSize: 12,
    color: '#8fa3b8',
    zIndex: 20,
  },
};
