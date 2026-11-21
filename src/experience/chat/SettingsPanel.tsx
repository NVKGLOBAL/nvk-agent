/**
 * NVK Agent — System Settings.
 *
 * The screen CODEXA's chat referenced but never had (fix-list item 7).
 * Model management, provider keys (session-only default), cloud toggle
 * (OFF by default), storage usage, reset.
 */
import { useState } from 'react';
import { settingsStore } from '../../intelligence/settings';
import { modelRegistry, MODEL_CATALOG } from '../../intelligence/model-registry';
import { localInferenceEngine } from '../../intelligence/inference';
import { memoryStore } from '../../intelligence/memory';

export function SettingsPanel() {
  const [settings, setSettings] = useState(settingsStore.get());
  const [keyInput, setKeyInput] = useState('');
  const [note, setNote] = useState<string | null>(null);

  function update(patch: Partial<typeof settings>) {
    settingsStore.update(patch);
    setSettings(settingsStore.get());
  }

  async function resetAll() {
    if (!window.confirm('Clear all local NVK Agent data (settings, memory, evidence)?')) {
      return;
    }
    await memoryStore.clearAll();
    localInferenceEngine.unload();
    update({ cloudEnabled: false, providerKey: null, persistKey: false });
    setNote('Local data cleared.');
  }

  return (
    <div style={styles.wrap}>
      <h2>System Settings</h2>

      <section style={styles.section}>
        <h3>Local model</h3>
        <p>Active model: <strong>{settings.activeModelId}</strong></p>
        <ul>
          {MODEL_CATALOG.map((m) => (
            <li key={m.id}>
              <label>
                <input
                  type="radio"
                  name="model"
                  checked={settings.activeModelId === m.id}
                  onChange={() => update({ activeModelId: m.id })}
                />{' '}
                {m.name} — {m.parameters}, ~{m.downloadSizeMb} MB, {m.runtime}
                {m.isRecommended ? ' (recommended)' : ''}
              </label>
              <br />
              <span style={styles.small}>{m.description}</span>
            </li>
          ))}
        </ul>
        <p style={styles.small}>
          Integrity: model weights are fetched from the Hugging Face hub. SHA-256
          verification is unverified until hub metadata is read — no hash is
          claimed without it.
        </p>
      </section>

      <section style={styles.section}>
        <h3>Cloud providers (optional)</h3>
        <label>
          <input
            type="checkbox"
            checked={settings.cloudEnabled}
            onChange={(e) => update({ cloudEnabled: e.target.checked })}
          />{' '}
          Enable cloud inference (requests leave this device)
        </label>
        <div style={styles.row}>
          <select
            value={settings.cloudProvider ?? ''}
            onChange={(e) =>
              update({
                cloudProvider: (e.target.value as 'gemini' | 'openai') || null,
              })
            }
            disabled={!settings.cloudEnabled}
            aria-label="Cloud provider"
          >
            <option value="">Select provider…</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Provider API key (session-only)"
            disabled={!settings.cloudEnabled || !settings.cloudProvider}
            aria-label="Provider API key"
            style={styles.input}
          />
          <button
            onClick={() => {
              if (settings.cloudProvider && keyInput) {
                settingsStore.setSessionKey(settings.cloudProvider, keyInput);
                setSettings(settingsStore.get());
                setKeyInput('');
                setNote('Key stored for this session only. It is never sent anywhere except its own provider endpoint.');
              }
            }}
            disabled={!settings.cloudEnabled || !settings.cloudProvider || !keyInput}
          >
            Use key for this session
          </button>
        </div>
        <label style={styles.small}>
          <input
            type="checkbox"
            checked={settings.persistKey}
            onChange={(e) => update({ persistKey: e.target.checked })}
          />{' '}
          Remember this key on this device (plaintext in local storage — not
          recommended)
        </label>
        {settings.providerKey && (
          <p>
            A provider key is set for this session.{' '}
            <button onClick={() => { settingsStore.clearKey(); setSettings(settingsStore.get()); }}>
              Clear key
            </button>
          </p>
        )}
        <p style={styles.small}>
          Cloud is off by default and never the fallback when local inference
          fails. A local failure is reported, not papered over.
        </p>
      </section>

      <section style={styles.section}>
        <h3>Data</h3>
        <p style={styles.small}>
          Memory, evidence, and settings live on this device only. No sync, no
          telemetry.
        </p>
        <button onClick={resetAll}>Clear all local data</button>
        {note && <p>{note}</p>}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  section: { border: '1px solid #1d2b3a', borderRadius: 12, padding: 14 },
  row: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  input: {
    background: '#0a121c',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 8,
    padding: '8px 10px',
    flex: 1,
    minWidth: 220,
  },
  small: { fontSize: 13, color: '#8fa3b8' },
};
