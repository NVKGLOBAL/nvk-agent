/**
 * NVK Agent — System Settings.
 *
 * The screen CODEXA's chat referenced but never had (fix-list item 7).
 * Model management, provider keys (session-only default), cloud toggle
 * (OFF by default), storage usage, reset.
 */
import { useEffect, useRef, useState } from 'react';
import { settingsStore } from '../../intelligence/settings';
import { modelRegistry, MODEL_CATALOG } from '../../intelligence/model-registry';
import { localInferenceEngine } from '../../intelligence/inference';
import { memoryStore } from '../../intelligence/memory';
import { runTraceStore } from '../../intelligence/runTrace';
import {
  AgentRelayClient,
  AGENT_DESKTOP_ID,
  generatePairingCode,
} from '../../intelligence/relayAdapter';

type RelayPermission = 'monitor' | 'voice' | 'approve' | 'control';

const RELAY_PERMISSIONS: { id: RelayPermission; label: string }[] = [
  { id: 'monitor', label: 'Monitor — see status, diagnostics and evidence' },
  { id: 'voice', label: 'Voice — send voice messages from the phone' },
  { id: 'approve', label: 'Approve — approve / reject permission requests' },
  { id: 'control', label: 'Control — send chat and task commands' },
];

const PAIRING_TTL_MS = 5 * 60 * 1000;

export function SettingsPanel({ relayClient }: { relayClient: AgentRelayClient | null }) {
  const [settings, setSettings] = useState(settingsStore.get());
  const [keyInput, setKeyInput] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const armTimer = useRef<number | null>(null);

  // --- Phone control (relay) ---------------------------------------------
  const [urlInput, setUrlInput] = useState(settings.relayUrl);
  const [tokenInput, setTokenInput] = useState('');
  const [rememberRelayToken, setRememberRelayToken] = useState(
    settings.persistRelayToken,
  );
  const [relayNote, setRelayNote] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<RelayPermission, boolean>>({
    monitor: true,
    voice: false,
    approve: false,
    control: false,
  });
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [relaySnapshot, setRelaySnapshot] = useState<{
    running: boolean;
    lastError: string | null;
    now: number;
  }>({ running: false, lastError: null, now: Date.now() });

  // The relay status line must never go stale: poll the client's real
  // running state + lastError every second (this also drives the
  // pairing-code countdown). A silent dead toggle is not a working relay.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRelaySnapshot({
        running: relayClient?.isRunning() ?? false,
        lastError: relayClient?.lastError ?? null,
        now: Date.now(),
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [relayClient]);

  const pairingExpired = pairing !== null && relaySnapshot.now >= pairing.expiresAt;
  const pairingSecondsLeft = pairing
    ? Math.max(0, Math.ceil((pairing.expiresAt - relaySnapshot.now) / 1000))
    : 0;
  const pairingCountdown = `${Math.floor(pairingSecondsLeft / 60)}:${String(pairingSecondsLeft % 60).padStart(2, '0')}`;

  const relayConfigured =
    settings.relayUrl.trim() !== '' && settings.relayDesktopToken !== null;
  const relayStatusText = !settings.relayEnabled
    ? 'Relay off — enable it to connect this agent to your phone.'
    : !relayConfigured
      ? 'Relay enabled but not running — the relay URL and desktop token are both required.'
      : !relayClient
        ? 'Relay starting…'
        : relaySnapshot.running
          ? 'Relay running — polling the relay every 2s.'
          : 'Relay paused — polling stopped. Press “Start relay” to resume.';

  function saveRelayUrl() {
    settingsStore.update({ relayUrl: urlInput.trim() });
    setSettings(settingsStore.get());
    setRelayNote(
      urlInput.trim()
        ? 'Relay URL saved.'
        : 'Relay URL cleared — the relay cannot run without one.',
    );
  }

  function saveRelayToken() {
    const token = tokenInput.trim();
    if (!token) return;
    if (rememberRelayToken) {
      settingsStore.update({ relayDesktopToken: token, persistRelayToken: true });
      setRelayNote(
        'Desktop token saved on this computer (plaintext in local storage — you opted in). It is never shown again after entry.',
      );
    } else {
      settingsStore.setSessionRelayToken(token);
      setRelayNote(
        'Desktop token saved for this session only. It is never shown again after entry.',
      );
    }
    setSettings(settingsStore.get());
    setTokenInput('');
  }

  function toggleRelayRunning() {
    if (!relayClient) return;
    if (relayClient.isRunning()) {
      relayClient.stop();
      setRelayNote('Relay paused — polling stopped. Start to resume.');
    } else {
      relayClient.start();
      setRelayNote('Relay resumed — polling the relay every 2s.');
    }
  }

  async function generatePairing() {
    if (!relayClient) {
      setPairingError(
        'Relay is not running — enable it and save the relay URL and desktop token first.',
      );
      return;
    }
    const code = generatePairingCode();
    const permissions = RELAY_PERMISSIONS.filter((p) => perms[p.id]).map((p) => p.id);
    setPairingBusy(true);
    setPairingError(null);
    setPairing(null);
    try {
      const res = await relayClient.registerPairing(code, permissions);
      if (res.ok) {
        setPairing({ code, expiresAt: Date.now() + PAIRING_TTL_MS });
      } else {
        // Registration failed: the code is NOT valid. Never show a
        // code the relay refused as if the phone could pair with it.
        setPairingError(
          `Pairing registration failed: ${String(res.error ?? 'the relay refused the code')}. No valid code was issued — try again.`,
        );
      }
    } catch (err) {
      setPairingError(
        `Pairing registration failed: ${String((err as Error)?.message ?? err)}. No valid code was issued — try again.`,
      );
    } finally {
      setPairingBusy(false);
    }
  }

  async function disconnectAll() {
    if (!relayClient) return;
    if (
      !window.confirm(
        'Disconnect all phones paired with this agent? They will need to pair again.',
      )
    ) {
      return;
    }
    try {
      const res = await relayClient.disconnectAll();
      setRelayNote(
        res.ok
          ? 'All phones disconnected.'
          : `Disconnect failed: ${String(res.error ?? 'unknown error')}`,
      );
    } catch (err) {
      setRelayNote(
        `Disconnect failed: ${String((err as Error)?.message ?? err)}`,
      );
    }
  }

  useEffect(() => {
    return () => {
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    };
  }, []);

  function update(patch: Partial<typeof settings>) {
    settingsStore.update(patch);
    setSettings(settingsStore.get());
  }

  async function resetAll() {
    // In-app two-step confirm (2026-11-23 live retest): the old
    // window.confirm() is auto-dismissed by headless/automation browsers
    // and suppressible in mobile Safari, so the clear silently never ran
    // — no dialog appeared, no note, nothing cleared. A native modal
    // must never gate a destructive action the user explicitly asked for.
    if (!confirmArmed) {
      setConfirmArmed(true);
      setNote(
        'Click "Clear all local data" again to confirm. This erases settings, memory, evidence, run traces and the cached model weights.',
      );
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setConfirmArmed(false), 10000);
      return;
    }
    if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    setConfirmArmed(false);
    setClearing(true);
    setNote(null);
    try {
      // clearAll() verifies the clear and reports false when data
      // survived; run traces live outside the memory store (their own
      // localStorage key plus an in-memory list that would re-save
      // itself on the next run), so they are cleared explicitly too.
      const verified = await memoryStore.clearAll();
      runTraceStore.clear();
      localInferenceEngine.unload();
      settingsStore.reset();
      setSettings(settingsStore.get());
      setNote(
        verified
          ? 'Local data cleared. Conversation, evidence, run traces and cached model weights are gone. The free cloud gateway is ON by default, so its toggle stays checked — that is the default, not leftover data.'
          : 'Clear ran but the storage check did not verify empty — some data may still be stored. Reload and check Diagnostics.',
      );
    } finally {
      setClearing(false);
    }
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
                cloudProvider: (e.target.value as 'openai') || null,
              })
            }
            disabled={!settings.cloudEnabled}
            aria-label="Cloud provider"
          >
            <option value="">Select provider…</option>
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
          Your own provider key is off by default and never the fallback when
          local inference fails. A local failure is reported, not papered over.
        </p>
        <label style={styles.small}>
          <input
            type="checkbox"
            checked={settings.freeCloudEnabled}
            onChange={(e) => update({ freeCloudEnabled: e.target.checked })}
          />{' '}
          Free cloud gateway (Kilo, keyless) — answers through the shared NVK
          brain endpoint when the local model is not loaded and no provider key
          is set. Requests leave this device. Turn it off for local-only.
        </label>
      </section>

      <section style={styles.section}>
        <h3>Phone control (relay)</h3>
        <p style={styles.small}>
          Control this agent from your phone through the NVK relay. Relay
          chat runs the same pipeline as typed chat — same gates, same
          evidence. Approve / reject from the phone goes through the real
          permission gate on this device. Task commands from the phone
          report “not available” — this agent has no continuous task
          engine yet.
        </p>
        <label>
          <input
            type="checkbox"
            checked={settings.relayEnabled}
            onChange={(e) => {
              update({ relayEnabled: e.target.checked });
              setRelayNote(
                e.target.checked
                  ? 'Relay enabled — it starts once the relay URL and desktop token are both saved.'
                  : 'Relay disabled.',
              );
            }}
          />{' '}
          Enable phone control (relay)
        </label>
        <div style={styles.row}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://nvk-relay.<your-subdomain>.workers.dev"
            aria-label="Relay URL"
            style={styles.input}
          />
          <button onClick={saveRelayUrl} disabled={!urlInput.trim()}>
            Save relay URL
          </button>
        </div>
        <p style={styles.small}>
          Paste the relay Worker URL once it is deployed. Empty means not
          configured — the relay never starts without one.
        </p>
        <div style={styles.row}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Desktop token (never shown after entry)"
            aria-label="Desktop token"
            style={styles.input}
            autoComplete="off"
          />
          <button onClick={saveRelayToken} disabled={!tokenInput.trim()}>
            Save token
          </button>
        </div>
        <label style={styles.small}>
          <input
            type="checkbox"
            checked={rememberRelayToken}
            onChange={(e) => setRememberRelayToken(e.target.checked)}
          />{' '}
          Remember this token on this computer (plaintext in local storage
          — not recommended)
        </label>
        {settings.relayDesktopToken && (
          <p>
            A desktop token is set{' '}
            {settings.persistRelayToken
              ? 'on this computer.'
              : 'for this session only.'}{' '}
            <button
              onClick={() => {
                settingsStore.clearRelayToken();
                setSettings(settingsStore.get());
                setRelayNote('Desktop token cleared.');
              }}
            >
              Clear token
            </button>
          </p>
        )}
        <div style={styles.row}>
          <button
            onClick={toggleRelayRunning}
            disabled={!relayClient}
          >
            {relaySnapshot.running ? 'Stop relay' : 'Start relay'}
          </button>
          <button
            onClick={generatePairing}
            disabled={!relayClient || pairingBusy}
          >
            {pairingBusy ? 'Registering…' : 'Generate pairing code'}
          </button>
          <button onClick={disconnectAll} disabled={!relayClient}>
            Disconnect all phones
          </button>
        </div>
        <p style={styles.small}>
          Desktop ID: <strong>{AGENT_DESKTOP_ID}</strong> — the phone pairs
          to this id. The pairing code is 6 digits and expires after 5
          minutes.
        </p>
        <fieldset style={styles.fieldset}>
          <legend>Permissions this pairing code allows</legend>
          {RELAY_PERMISSIONS.map((p) => (
            <label key={p.id} style={styles.checkRow}>
              <input
                type="checkbox"
                checked={perms[p.id]}
                onChange={(e) =>
                  setPerms((prev) => ({ ...prev, [p.id]: e.target.checked }))
                }
              />{' '}
              {p.label}
            </label>
          ))}
          <p style={styles.small}>
            These are sent with the pairing registration. The phone
            confirms its permissions when it pairs.
          </p>
        </fieldset>
        {pairing && !pairingExpired && (
          <p role="status">
            Pairing code: <strong style={styles.code}>{pairing.code}</strong>{' '}
            · Desktop ID: <strong>{AGENT_DESKTOP_ID}</strong> · expires in{' '}
            {pairingCountdown}
          </p>
        )}
        {pairingExpired && (
          <p role="status">
            Pairing code expired — generate a new one.
          </p>
        )}
        {pairingError && <p role="alert">{pairingError}</p>}
        <p role="status">{relayStatusText}</p>
        {relaySnapshot.lastError && (
          <p role="alert">Relay error: {relaySnapshot.lastError}</p>
        )}
        {relayNote && <p>{relayNote}</p>}
      </section>

      <section style={styles.section}>
        <h3>Data</h3>
        <p style={styles.small}>
          Memory, evidence, and settings live on this device only. No sync, no
          telemetry.
        </p>
        <button onClick={resetAll} disabled={clearing}>
          {clearing
            ? 'Clearing…'
            : confirmArmed
              ? 'Click again to confirm clear'
              : 'Clear all local data'}
        </button>
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
  fieldset: { border: '1px solid #2a3b4d', borderRadius: 8, padding: '10px 12px', marginTop: 8 },
  checkRow: { display: 'block', fontSize: 14, margin: '4px 0' },
  code: { fontSize: 24, letterSpacing: 4 },
};
