/**
 * NVK Agent — chat UI.
 *
 * CODEXA fix-list items 15 + 17, built: an honest engine-status card and a
 * demo-mode banner. When no model is loaded the input explains demo mode —
 * it never returns a fake reply.
 */
import { useEffect, useState } from 'react';
import { runPipeline, PipelineResult } from '../../intelligence/pipeline';
import { localInferenceEngine, EngineState } from '../../intelligence/inference';
import { modelRegistry } from '../../intelligence/model-registry';
import { settingsStore } from '../../intelligence/settings';
import { memoryStore, ConversationTurn } from '../../intelligence/memory';
import { reverifyEvidence } from '../../sovereign/evidence';

export function Chat() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [engine, setEngine] = useState<EngineState>(localInferenceEngine.getState());
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<PipelineResult | null>(null);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  useEffect(() => {
    const un1 = localInferenceEngine.subscribe(() =>
      setEngine(localInferenceEngine.getState()),
    );
    memoryStore.getConversation().then(setTurns);
    return un1;
  }, []);

  const settings = settingsStore.get();
  const demoMode = engine.status !== 'ready' && !settings.cloudEnabled;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setVerifyNote(null);
    try {
      const result = await runPipeline(text);
      setLastResult(result);
      setTurns(await memoryStore.getConversation());
    } finally {
      setBusy(false);
    }
  }

  async function downloadModel() {
    setDownloadNote(null);
    const ok = await modelRegistry.installWithConsent(
      settings.activeModelId,
      consent,
    );
    setDownloadNote(
      ok
        ? 'Model installed and validated (answered "2+2" with "4").'
        : modelRegistry.getStatusMessage(),
    );
  }

  async function reverify() {
    if (!lastResult?.evidenceId) return;
    const res = await reverifyEvidence(lastResult.evidenceId);
    setVerifyNote(res.detail);
  }

  return (
    <div style={styles.wrap}>
      {/* Engine status card — fix-list item 15. Three real states only. */}
      <div style={styles.statusCard} role="status">
        {engine.status === 'ready' ? (
          <p>
            <strong>Local model loaded:</strong> {engine.activeModelId} · adapter{' '}
            {engine.lastAdapter ?? 'unknown'} · last generation{' '}
            {engine.lastTokensPerSecond ?? '—'} tok/s
          </p>
        ) : settings.cloudEnabled && settings.providerKey ? (
          <p>
            <strong>Cloud connected:</strong> {settings.cloudProvider}. Requests leave
            this device.
          </p>
        ) : (
          <p>
            <strong>No model loaded.</strong> Chat is in demo mode. Download a model
            or connect a provider in Settings to chat for real.
          </p>
        )}
      </div>

      {demoMode && (
        <div style={styles.demoBanner}>
          Demo mode — no model loaded. Nothing here is a real answer until a
          model is downloaded or a provider is connected.
        </div>
      )}

      {engine.status !== 'ready' && (
        <div style={styles.download}>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{' '}
            I approve downloading {settings.activeModelId} (
            {modelRegistry.getActiveModel()?.downloadSizeMb ?? '?'} MB) from the
            Hugging Face hub.
          </label>
          <button onClick={downloadModel} disabled={!consent} style={styles.button}>
            Download + validate model
          </button>
          {downloadNote && <p>{downloadNote}</p>}
          <p style={styles.small}>Registry: {modelRegistry.getStatusMessage()}</p>
        </div>
      )}

      <div style={styles.thread} aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} style={t.role === 'user' ? styles.userTurn : styles.agentTurn}>
            <strong>{t.role === 'user' ? 'You' : 'NVK Agent'}</strong>
            <p style={styles.turnText}>{t.text}</p>
            {t.role === 'agent' && t.tokensPerSecond != null && (
              <span style={styles.small}>{t.tokensPerSecond} tok/s</span>
            )}
          </div>
        ))}
        {turns.length === 0 && (
          <p style={styles.small}>
            No conversation yet. Ask something — or try the validation prompt:{' '}
            <em>What is 2+2? Answer in one word.</em>
          </p>
        )}
      </div>

      <div style={styles.composer}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={
            demoMode
              ? 'Demo mode — download a model to chat for real…'
              : 'Ask the agent…'
          }
          aria-label="Message the agent"
          style={styles.input}
        />
        <button onClick={send} disabled={busy || !input.trim()} style={styles.button}>
          {busy ? 'Working…' : 'Send'}
        </button>
      </div>

      {lastResult && (
        <div style={styles.resultMeta}>
          <span>
            Route: {lastResult.route} · stages:{' '}
            {lastResult.stages.map((s) => s.stage).join(' → ')}
          </span>
          {lastResult.evidenceId && (
            <span>
              {' '}
              · evidence {lastResult.evidenceId}{' '}
              <button onClick={reverify} style={styles.linkButton}>
                Re-verify proof
              </button>
            </span>
          )}
          {verifyNote && <p>{verifyNote}</p>}
          {lastResult.blocked && <p role="alert">{lastResult.blockedReason}</p>}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  statusCard: {
    border: '1px solid #1d2b3a',
    borderRadius: 12,
    padding: '10px 14px',
    background: '#0a121c',
  },
  demoBanner: {
    border: '1px solid #7a5b00',
    background: '#241c05',
    color: '#ffd166',
    borderRadius: 12,
    padding: '10px 14px',
  },
  download: {
    border: '1px dashed #2a3b4d',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-start',
  },
  thread: { display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 },
  userTurn: { background: '#0e1a26', borderRadius: 12, padding: '8px 12px' },
  agentTurn: { background: '#101a10', borderRadius: 12, padding: '8px 12px' },
  turnText: { margin: '4px 0', whiteSpace: 'pre-wrap' },
  composer: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    background: '#0a121c',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 15,
  },
  button: {
    background: '#00e5ff',
    color: '#04121a',
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#00e5ff',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  resultMeta: { fontSize: 13, color: '#8fa3b8' },
  small: { fontSize: 13, color: '#8fa3b8' },
};
