/**
 * NVK Agent — inference router.
 *
 * Local FIRST, always. A cloud provider (OpenAI) is available only
 * when the owner explicitly enables cloud in Settings AND supplies a key.
 * A second provider path was removed per owner direction (2026-11-23)
 * — no second provider ships in this file.
 * The free cloud gateway (the shared NVK brain endpoint, Kilo free tier,
 * keyless) is ON by default — NvK wants the AI unlimited (2026-11-23) and
 * approved the same Kilo tier in CODEXA's default chain. It answers only
 * when the local model is not loaded and no provider key is configured;
 * it never overrides a loaded local model, and it is never silent — the
 * answer carries its tier and the status card names the gateway. A local
 * failure is still reported honestly, not papered over: when the gateway
 * itself cannot answer, the pipeline falls through to demo mode.
 */
import { localInferenceEngine, ModelNotLoadedError } from './inference';
import { settingsStore } from './settings';

/** The shared NVK brain endpoint — the same Worker CODEXA serves from. */
export const NVK_GATEWAY_BASE = 'https://codexa.nvkglobal.workers.dev';

export type Route = 'local' | 'cloud-openai' | 'cloud-gateway';

export interface RouteDecision {
  route: Route;
  reason: string;
}

export function decideRoute(): RouteDecision {
  const settings = settingsStore.get();
  if (localInferenceEngine.isReady()) {
    return { route: 'local', reason: 'Local model is loaded and ready.' };
  }
  if (settings.cloudEnabled && settings.providerKey && settings.cloudProvider) {
    return {
      route: 'cloud-openai',
      reason: `Local model not loaded; cloud explicitly enabled (${settings.cloudProvider}). Requests leave this device.`,
    };
  }
  if (settings.freeCloudEnabled) {
    return {
      route: 'cloud-gateway',
      reason: 'Local model not loaded; free cloud gateway (Kilo, keyless) enabled. Requests leave this device to the shared NVK brain endpoint.',
    };
  }
  return {
    route: 'local',
    reason: 'Local model not loaded and cloud is off. Demo mode.',
  };
}

export interface CloudGenerateResult {
  text: string;
  provider: 'openai';
}

/**
 * Minimal cloud generation. Real fetch, real provider endpoints, real key
 * from the session settings. No key is ever sent anywhere except its own
 * provider endpoint. Throws when cloud is not enabled — never silent.
 */
export async function generateViaCloud(
  prompt: string,
  maxNewTokens = 256,
): Promise<CloudGenerateResult> {
  const settings = settingsStore.get();
  if (!settings.cloudEnabled || !settings.providerKey || !settings.cloudProvider) {
    throw new Error(
      'Cloud is not enabled. Enable it in Settings and add a provider key — or load a local model.',
    );
  }
  const key = settings.providerKey;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxNewTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: HTTP ${res.status}`);
  const data = await res.json();
  return { text: data?.choices?.[0]?.message?.content ?? '', provider: 'openai' };
}

export interface GatewayGenerateResult {
  text: string;
  tier: string;
  model: string;
  notice: string | null;
}

/**
 * Free cloud gateway generation (Kilo free tier, keyless, via the shared
 * NVK brain endpoint). No key is needed and none is sent. Returns null
 * when the gateway cannot serve the request (all tiers exhausted, a
 * network failure, a non-JSON response) — the caller falls through to
 * demo mode honestly, never a fabricated answer. The gateway's CORS is
 * `*`, so this works cross-origin from the Agent's GitHub Pages origin.
 * The gateway returns `{tier, model, text, usage, notice}` or HTTP 429.
 */
export async function generateViaGateway(
  prompt: string,
  maxNewTokens = 256,
): Promise<GatewayGenerateResult | null> {
  let res: Response;
  try {
    res = await fetch(`${NVK_GATEWAY_BASE}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxNewTokens,
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let data: any;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  const text = typeof data?.text === 'string' ? data.text : '';
  if (!text) return null;
  return {
    text,
    tier: typeof data?.tier === 'string' ? data.tier : 'gateway',
    model: typeof data?.model === 'string' ? data.model : '',
    notice: typeof data?.notice === 'string' ? data.notice : null,
  };
}

export { ModelNotLoadedError };
