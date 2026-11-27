/**
 * NVK Agent — settings.
 *
 * CODEXA fix-list item 7, built: the System Settings module CODEXA's chat
 * referenced but never had. Cloud is OFF by default. Provider keys are
 * session-only by default — persisted only if the owner explicitly opts in,
 * with a plain-language warning that local persistence is plaintext.
 */
import { INFERENCE_MODELS } from './inference';

export interface AgentSettings {
  activeModelId: string;
  cloudEnabled: boolean;
  cloudProvider: 'openai' | null;
  /** Provider key lives in memory for the session. Never persisted unless persistKey is true. */
  providerKey: string | null;
  persistKey: boolean;
  downloadConsentGiven: boolean;
  /**
   * Free cloud gateway (the shared NVK brain endpoint,
   * codexa.nvkglobal.workers.dev — Kilo free tier, keyless). ON by
   * default: NvK wants the AI unlimited (2026-11-23) and approved the
   * same Kilo tier in CODEXA's default chain. When the local model is
   * not loaded and no provider key is configured, the gateway answers
   * instead of demo mode. Requests leave this device to the gateway;
   * sensitive work stays local. Turn it off in Settings for local-only.
   */
  freeCloudEnabled: boolean;
  /**
   * Phone control via the NVK relay (Sprint 8). OFF by default.
   * relayUrl is the relay Worker URL the owner pastes once it is
   * deployed — empty means not configured. relayDesktopToken is the
   * desktop token: session-only by default (kept in memory + this
   * tab's sessionStorage), persisted to localStorage only when
   * persistRelayToken is explicitly opted in — the same pattern as
   * providerKey / persistKey above.
   */
  relayEnabled: boolean;
  relayUrl: string;
  relayDesktopToken: string | null;
  persistRelayToken: boolean;
}

const SETTINGS_KEY = 'nvk-agent:settings';
const RELAY_TOKEN_SESSION_KEY = 'nvk-agent:relay-token';
const DEFAULTS: AgentSettings = {
  activeModelId: INFERENCE_MODELS[0].id,
  cloudEnabled: false,
  cloudProvider: null,
  providerKey: null,
  persistKey: false,
  downloadConsentGiven: false,
  freeCloudEnabled: true,
  relayEnabled: false,
  relayUrl: '',
  relayDesktopToken: null,
  persistRelayToken: false,
};

function readSessionRelayToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(RELAY_TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionRelayToken(token: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (token) sessionStorage.setItem(RELAY_TOKEN_SESSION_KEY, token);
    else sessionStorage.removeItem(RELAY_TOKEN_SESSION_KEY);
  } catch {
    /* session storage blocked — the in-memory token still applies */
  }
}

function readStored(): Partial<AgentSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AgentSettings>;
    // A stored key is only honoured when the owner explicitly opted in.
    if (!parsed.persistKey) delete parsed.providerKey;
    if (!parsed.persistRelayToken) delete parsed.relayDesktopToken;
    return parsed;
  } catch {
    return {};
  }
}

export class SettingsStore {
  // A session-only relay token (this tab's sessionStorage) is honoured
  // on load when no persisted token was opted in — same as the
  // provider key, but sessionStorage survives a reload of the tab.
  // A persisted (opted-in) token always wins over a session one.
  private settings: AgentSettings = (() => {
    const stored = readStored();
    const sessionToken = stored.persistRelayToken ? null : readSessionRelayToken();
    return {
      ...DEFAULTS,
      ...stored,
      ...(sessionToken
        ? { relayDesktopToken: sessionToken, persistRelayToken: false }
        : {}),
    };
  })();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* never break settings */
      }
    });
  }

  get(): AgentSettings {
    return { ...this.settings };
  }

  update(patch: Partial<AgentSettings>): void {
    this.settings = { ...this.settings, ...patch };
    // Persist everything EXCEPT a provider key the owner did not opt to keep.
    const toStore: AgentSettings = { ...this.settings };
    if (!toStore.persistKey) toStore.providerKey = null;
    // Same for the relay token: localStorage only when opted in.
    if (!toStore.persistRelayToken) toStore.relayDesktopToken = null;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toStore));
    } catch {
      /* storage blocked — in-memory settings still apply */
    }
    // A session-only relay token lives in this tab's sessionStorage so
    // it survives a reload without ever touching localStorage.
    writeSessionRelayToken(
      this.settings.persistRelayToken ? null : this.settings.relayDesktopToken,
    );
    this.notify();
  }

  /**
   * Restore factory defaults and persist them. Used by "Clear all local
   * data" (2026-11-23): the old path merged a partial patch
   * ({cloudEnabled, providerKey, persistKey}) over the live settings, so
   * freeCloudEnabled, activeModelId and downloadConsentGiven always
   * survived a clear — and update() re-wrote the settings key to
   * localStorage immediately after clearAll() had deleted it, so the
   * settings were never actually cleared at all.
   *
   * Note the default has the free cloud gateway ON, so after a true
   * reset the Kilo toggle is still checked — that is the default, not
   * leftover data. The Settings panel says so in its confirmation note.
   */
  reset(): void {
    this.settings = { ...DEFAULTS };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage blocked — in-memory defaults still apply */
    }
    writeSessionRelayToken(null);
    this.notify();
  }

  /** Session-only key: set for this session, never written to storage. */
  setSessionKey(provider: 'openai', key: string): void {
    this.settings = {
      ...this.settings,
      cloudProvider: provider,
      providerKey: key,
      persistKey: false,
    };
    this.notify();
  }

  clearKey(): void {
    this.update({ providerKey: null, persistKey: false });
  }

  /** Session-only relay token: set for this session (+ this tab's sessionStorage), never written to localStorage. */
  setSessionRelayToken(token: string): void {
    this.settings = {
      ...this.settings,
      relayDesktopToken: token,
      persistRelayToken: false,
    };
    writeSessionRelayToken(token);
    this.notify();
  }

  clearRelayToken(): void {
    this.update({ relayDesktopToken: null, persistRelayToken: false });
    writeSessionRelayToken(null);
  }
}

export const settingsStore = new SettingsStore();
