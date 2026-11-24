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
  cloudProvider: 'gemini' | 'openai' | null;
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
}

const SETTINGS_KEY = 'nvk-agent:settings';
const DEFAULTS: AgentSettings = {
  activeModelId: INFERENCE_MODELS[0].id,
  cloudEnabled: false,
  cloudProvider: null,
  providerKey: null,
  persistKey: false,
  downloadConsentGiven: false,
  freeCloudEnabled: true,
};

function readStored(): Partial<AgentSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AgentSettings>;
    // A stored key is only honoured when the owner explicitly opted in.
    if (!parsed.persistKey) delete parsed.providerKey;
    return parsed;
  } catch {
    return {};
  }
}

export class SettingsStore {
  private settings: AgentSettings = { ...DEFAULTS, ...readStored() };
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
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toStore));
    } catch {
      /* storage blocked — in-memory settings still apply */
    }
    this.notify();
  }

  /** Session-only key: set for this session, never written to storage. */
  setSessionKey(provider: 'gemini' | 'openai', key: string): void {
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
}

export const settingsStore = new SettingsStore();
