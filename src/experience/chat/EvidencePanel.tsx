/**
 * NVK Agent — evidence panel (v0.1.8).
 *
 * The orb's Evidence node opens this panel. It reads from the real
 * evidence store (src/sovereign/evidence.ts) — every pipeline result
 * recorded with a SHA-256 content hash — and lists the entries with
 * their hashes. "Re-verify" recomputes the hash from the stored
 * payload and reports pass/fail; it is a real check, not a button
 * that does nothing. When the store is empty the panel says so
 * honestly — it never fabricates entries.
 */
import { useEffect, useState } from 'react';
import {
  listEvidence,
  reverifyEvidence,
  EvidenceRecord,
} from '../../sovereign/evidence';

export function EvidencePanel() {
  const [entries, setEntries] = useState<EvidenceRecord[] | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState<string | null>(null);

  async function load() {
    setEntries(await listEvidence());
  }

  useEffect(() => {
    load();
  }, []);

  async function verify(id: string) {
    setChecking(id);
    try {
      const r = await reverifyEvidence(id);
      setResults((prev) => ({ ...prev, [id]: r.detail }));
    } finally {
      setChecking(null);
    }
  }

  const shown = entries === null ? [] : [...entries].reverse();

  return (
    <div style={styles.wrap}>
      <h2>Evidence</h2>
      <p style={styles.small}>
        Every result the agent produces is recorded here with a SHA-256
        content hash. Re-verify recomputes the hash from the stored
        payload — a mismatch means the record was altered.
      </p>
      <button onClick={load} style={styles.button}>
        Refresh
      </button>
      {entries === null && <p style={styles.small}>Loading…</p>}
      {entries !== null && entries.length === 0 && (
        <p>
          No evidence recorded yet — ask the agent something (or run the
          2+2 check) and each verified result will appear here with its
          hash.
        </p>
      )}
      {shown.map((e) => (
        <div key={e.id} style={styles.card}>
          <p style={styles.line}>
            <strong>{e.input}</strong>
          </p>
          <p style={styles.line}>{e.answer}</p>
          <p style={styles.small}>
            {new Date(e.at).toLocaleString()} · route: {e.route} · model:{' '}
            {e.modelId ?? 'none'} · {e.demoMode ? 'demo mode' : 'local model'} ·{' '}
            {e.intent}
          </p>
          <p style={styles.hash}>sha256: {e.sha256}</p>
          <button
            onClick={() => verify(e.id)}
            disabled={checking === e.id}
            style={styles.button}
          >
            {checking === e.id ? 'Verifying…' : 'Re-verify proof'}
          </button>
          {results[e.id] && <p style={styles.result}>{results[e.id]}</p>}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  small: { fontSize: 13, color: '#8fa3b8', margin: 0 },
  button: {
    alignSelf: 'flex-start',
    background: '#0a121c',
    color: '#00e5ff',
    border: '1px solid #00e5ff',
    borderRadius: 999,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 14,
  },
  card: {
    border: '1px solid #1d2b3a',
    borderRadius: 12,
    padding: '12px 14px',
    background: '#050608',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  line: { margin: 0, fontSize: 14 },
  hash: { margin: 0, fontSize: 12, color: '#8fa3b8', wordBreak: 'break-all' },
  result: { margin: 0, fontSize: 13, color: '#3dff9e' },
};
