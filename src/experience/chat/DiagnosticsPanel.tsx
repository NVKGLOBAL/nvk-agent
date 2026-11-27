/**
 * NVK Agent — diagnostics + capability matrix.
 *
 * Fix-list items 4 + 16: diagnostics that can say FAIL, and one page listing
 * every capability with its honest status and evidence.
 */
import { useState, useEffect } from 'react';
import { runDiagnostics, DiagnosticsReport } from '../../intelligence/diagnostics';
import { CAPABILITIES } from '../../intelligence/capability-registry';

const STATUS_COLOR: Record<string, string> = {
  OPERATIONAL: '#3dff9e',
  PARTIAL: '#ffd166',
  DISCONNECTED: '#8fa3b8',
  SIMULATED: '#ff9f5a',
  BROKEN: '#ff5a5a',
  MISSING: '#5a6b7d',
  BLOCKED: '#c678ff',
};

export function DiagnosticsPanel() {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      setReport(await runDiagnostics());
    } finally {
      setRunning(false);
    }
  }

  // 2026-11-24 fix: the report used to be a frozen snapshot from the last
  // button click — run diagnostics, then chat, and the panel still showed
  // the pre-chat "0 requests". Run fresh on mount so opening the panel
  // after a chat shows the current count; the button still re-runs.
  useEffect(() => {
    let alive = true;
    setRunning(true);
    runDiagnostics()
      .then((r) => {
        if (alive) setReport(r);
      })
      .finally(() => {
        if (alive) setRunning(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={styles.wrap}>
      <h2>Diagnostics</h2>
      <p style={styles.small}>
        Every check measures something real. A diagnostic that cannot say FAIL
        is decoration.
      </p>
      <button onClick={run} disabled={running} style={styles.button}>
        {running ? 'Running…' : 'Run diagnostics'}
      </button>
      {report && (
        <div>
          <p>
            Overall: <strong>{report.overall.toUpperCase()}</strong> ·{' '}
            {new Date(report.at).toLocaleTimeString()}
          </p>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Check</th>
                <th style={styles.th}>Result</th>
                <th style={styles.th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.name}>
                  <td style={styles.td}>{c.name}</td>
                  <td style={styles.td}>
                    <strong style={{ color: STATUS_COLOR[c.result.toUpperCase()] ?? '#fff' }}>
                      {c.result.toUpperCase()}
                    </strong>
                  </td>
                  <td style={styles.td}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={styles.h2}>Capability matrix</h2>
      <p style={styles.small}>
        One table, every capability, honest status. “Planned” is forgivable;
        discovering it is not.
      </p>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Capability</th>
            <th style={styles.th}>Layer</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Evidence / gap</th>
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((c) => (
            <tr key={c.id}>
              <td style={styles.td}>{c.name}</td>
              <td style={styles.td}>{c.layer}</td>
              <td style={styles.td}>
                <strong style={{ color: STATUS_COLOR[c.status] }}>{c.status}</strong>
              </td>
              <td style={styles.td}>
                {c.evidence}
                {c.notes ? <div style={styles.small}>{c.notes}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  h2: { marginTop: 24 },
  button: {
    background: '#00e5ff',
    color: '#04121a',
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 14 },
  th: { textAlign: 'left', borderBottom: '1px solid #2a3b4d', padding: '8px' },
  td: {
    borderBottom: '1px solid #1d2b3a',
    padding: '8px',
    verticalAlign: 'top',
  },
  small: { fontSize: 13, color: '#8fa3b8' },
};
