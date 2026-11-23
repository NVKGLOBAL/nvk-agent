import { useState } from 'react';
import { OrbHost, OrbPanel } from './experience/orb/OrbHost';
import { Chat } from './experience/chat/Chat';
import { SettingsPanel } from './experience/chat/SettingsPanel';
import { DiagnosticsPanel } from './experience/chat/DiagnosticsPanel';
import { AgentsPanel } from './experience/chat/AgentsPanel';
import { VisualizersPanel } from './experience/visualizers/VisualizersPanel';
import { HERO_CAPABILITIES, EXAMPLE_PROMPTS } from './experience/hero-content';

const TABS: { id: OrbPanel; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'visualizers', label: 'Visualizations' },
  { id: 'agents', label: 'Agents' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [panel, setPanel] = useState<OrbPanel>('chat');
  const [chatPrefill, setChatPrefill] = useState<{ text: string; nonce: number } | null>(null);

  // Tapping an example prompt drops it into the chat composer and opens chat.
  const askExample = (text: string) => {
    setChatPrefill({ text, nonce: Date.now() });
    setPanel('chat');
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>NVK Agent</h1>
          <p style={styles.subtitle}>
            Your own AI agent that runs on your phone — no cloud, no account.
            The orb shows what it is really doing.
          </p>
        </div>
        <nav style={styles.nav} className="app-nav" aria-label="Sections">
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

        {/* First-screen hero: what this is and what it can do, no scrolling. */}
        <section aria-label="What NVK Agent can do" style={styles.hero}>
          <h2 style={styles.heroTitle}>What it can do</h2>
          <ul style={styles.capList}>
            {HERO_CAPABILITIES.map((c) => (
              <li key={c.capabilityId}>
                <button
                  onClick={() => setPanel(c.panel)}
                  style={styles.capButton}
                  aria-label={`${c.title} — open ${c.panel}`}
                >
                  <strong>{c.title}</strong>
                  <span style={styles.capDetail}>{c.detail}</span>
                </button>
              </li>
            ))}
          </ul>
          <p style={styles.tryLabel}>Try it — tap a question:</p>
          <div style={styles.promptRow}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button key={p} onClick={() => askExample(p)} style={styles.promptChip}>
                {p}
              </button>
            ))}
          </div>
        </section>

        <div style={styles.panel}>
          {panel === 'chat' && <Chat prefill={chatPrefill} />}
          {panel === 'visualizers' && <VisualizersPanel />}
          {panel === 'agents' && <AgentsPanel />}
          {panel === 'diagnostics' && <DiagnosticsPanel />}
          {panel === 'settings' && <SettingsPanel />}
        </div>
      </main>

      <footer style={styles.footer}>
        NVK Agent v0.1.6 — local-first preview. Local inference first; cloud
        only by explicit opt-in. No capability is claimed without evidence —
        see Diagnostics → Capability matrix.
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
  // Nav layout lives in index.css (.app-nav): one scrollable row on
  // desktop, wrapping buttons on phones. Retest #3: the nowrap row cut
  // Settings off on a ~500px screen and the page itself gained a
  // horizontal scrollbar — on phones the pills wrap instead of scrolling.
  nav: {
    display: 'flex',
    gap: 8,
    paddingBottom: 4,
  },
  tab: {
    background: '#0a121c',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 999,
    padding: '8px 16px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  tabActive: { background: '#00e5ff', color: '#04121a', borderColor: '#00e5ff' },
  main: { display: 'flex', flexDirection: 'column', gap: 20 },
  hero: {
    border: '1px solid #1d2b3a',
    borderRadius: 16,
    padding: '16px 20px',
    background: '#0a121c',
  },
  heroTitle: { margin: '0 0 12px', fontSize: 18 },
  capList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 8,
  },
  capButton: {
    width: '100%',
    textAlign: 'left',
    background: '#050608',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 12,
    padding: '10px 12px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  capDetail: { fontSize: 13, color: '#8fa3b8' },
  tryLabel: { margin: '14px 0 8px', fontSize: 14, color: '#8fa3b8' },
  promptRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  promptChip: {
    background: '#04121a',
    color: '#00e5ff',
    border: '1px solid #00e5ff',
    borderRadius: 999,
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 14,
  },
  // overflowX auto (v0.1.4): the diagnostics/settings tables are wider
  // than a phone — they scroll inside the panel instead of pushing the
  // whole page into a horizontal scrollbar (retest #3).
  panel: { border: '1px solid #1d2b3a', borderRadius: 16, padding: 20, overflowX: 'auto' },
  footer: { fontSize: 13, color: '#8fa3b8', textAlign: 'center' },
};
