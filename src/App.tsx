import { useState } from 'react';
import { OrbHost, OrbPanel } from './experience/orb/OrbHost';
import { Chat } from './experience/chat/Chat';
import { SettingsPanel } from './experience/chat/SettingsPanel';
import { DiagnosticsPanel } from './experience/chat/DiagnosticsPanel';
import { AgentsPanel } from './experience/chat/AgentsPanel';
import { VisualizersPanel } from './experience/visualizers/VisualizersPanel';

const TABS: { id: OrbPanel; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'visualizers', label: 'Visualizations' },
  { id: 'agents', label: 'Agents' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [panel, setPanel] = useState<OrbPanel>('chat');

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>NVK Agent</h1>
          <p style={styles.subtitle}>
            Sovereign intelligence — local-first, the orb as its face. CODEXA-inspired,
            built to real.
          </p>
        </div>
        <nav style={styles.nav} aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setPanel(t.id)}
              aria-current={panel === t.id ? 'page' : undefined}
              style={{
                ...styles.tab,
                ...(panel === t.id ? styles.tabActive : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={styles.main}>
        <OrbHost onNavigate={setPanel} />
        <div style={styles.panel}>
          {panel === 'chat' && <Chat />}
          {panel === 'visualizers' && <VisualizersPanel />}
          {panel === 'agents' && <AgentsPanel />}
          {panel === 'diagnostics' && <DiagnosticsPanel />}
          {panel === 'settings' && <SettingsPanel />}
        </div>
      </main>

      <footer style={styles.footer}>
        NVK Agent v0.1.0 — scaffold. Local inference first; cloud only by
        explicit opt-in. No capability is claimed without evidence — see
        Diagnostics → Capability matrix.
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1080,
    margin: '0 auto',
    padding: '24px 16px 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  title: { margin: 0, fontSize: 32, letterSpacing: 2 },
  subtitle: { margin: 0, color: '#8fa3b8' },
  nav: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tab: {
    background: '#0a121c',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 999,
    padding: '8px 16px',
    cursor: 'pointer',
  },
  tabActive: { background: '#00e5ff', color: '#04121a', borderColor: '#00e5ff' },
  main: { display: 'flex', flexDirection: 'column', gap: 20 },
  panel: { border: '1px solid #1d2b3a', borderRadius: 16, padding: 20 },
  footer: { fontSize: 13, color: '#8fa3b8', textAlign: 'center' },
};
