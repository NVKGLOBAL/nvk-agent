/**
 * NVK Agent — inference router.
 *
 * Local FIRST, always. Cloud providers (Gemini / OpenAI) are available only
 * when the owner explicitly enables cloud in Settings AND supplies a key.
 * Cloud is off by default, never silent, never the fallback when local fails
 * — a local failure is reported honestly, not papered over with a cloud call.
 */
import { localInferenceEngine, ModelNotLoadedError } from './inference';
import { settingsStore } from './settings';

export type Route = 'local' | 'cloud-gemini' | 'cloud-openai';

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
      route: settings.cloudProvider === 'gemini' ? 'cloud-gemini' : 'cloud-openai',
      reason: `Local model not loaded; cloud explicitly enabled (${settings.cloudProvider}). Requests leave this device.`,
    };
  }
  return {
    route: 'local',
    reason: 'Local model not loaded and cloud is off. Demo mode.',
  };
}

export interface CloudGenerateResult {
  text: string;
  provider: 'gemini' | 'openai';
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

  if (settings.cloudProvider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxNewTokens },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini request failed: HTTP ${res.status}`);
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    return { text, provider: 'gemini' };
  }

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

export { ModelNotLoadedError };
