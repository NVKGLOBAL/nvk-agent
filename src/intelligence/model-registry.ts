/**
 * NVK Agent — local model registry.
 *
 * Adapted from CODEXA's LocalModelRegistryService, with the theater removed:
 *   - No placeholder SHA-256 hashes. `expectedSha256` is null until it is
 *     fetched from the model's real hub metadata; a model whose hash is
 *     unknown is labelled "integrity unverified", never "verified".
 *   - No fake progress loop. Download progress comes from the real engine.
 *   - The readiness gate is the real milestone-10 test: load the model and
 *     ask "2+2? Answer in one word." A model that cannot answer "4" is not
 *     marked READY.
 */
import {
  INFERENCE_MODELS,
  LocalInferenceEngine,
  checkMilestone10Answer,
  localInferenceEngine,
} from './inference';

export type RegistryStatus =
  | 'DETECTING_HARDWARE'
  | 'MODEL_NOT_INSTALLED'
  | 'AWAITING_CONSENT'
  | 'DOWNLOADING'
  | 'LOADING_MODEL'
  | 'VALIDATING'
  | 'READY'
  | 'FAILED'
  | 'OFFLINE';

export interface ModelDescriptor {
  id: string;
  name: string;
  family: 'SmolLM' | 'Qwen' | 'Flan-T5' | 'GPT-2';
  parameters: string;
  downloadSizeMb: number;
  requiredRamGb: number;
  runtime: 'wasm_cpu' | 'webgpu';
  quantization: string;
  description: string;
  /** Real SHA-256 of the weights, fetched from hub metadata when available. Null = unverified. */
  expectedSha256: string | null;
  isInstalled: boolean;
  isLoaded: boolean;
  isRecommended: boolean;
}

export const MODEL_CATALOG: ModelDescriptor[] = [
  // Small-model probe, 2026-11-21 (mobile default search): NO smaller model
  // that actually answers 2+2 was found, so Qwen1.5-0.5B-Chat stays the
  // default on every device. Probed in Node: Xenova/SmolLM-135M[-Instruct]
  // and SmolLM2/Qwen2-0.5B-Instruct all return HTTP 401 from the Hugging
  // Face hub (unverifiable here); LaMini-Flan-T5-77M (94 MB) answered
  // "2+2 is a word that has two equal sides." (FAIL); distilgpt2 (82 MB)
  // "answered" by counting "1.2.1.2.3.4.5.6" — a false pass under the old
  // word-boundary check, correctly FAILED by the tightened token check.
  // The iPhone crash path is therefore mitigated, not model-swapped: browser
  // cache ON (a crash no longer forces a full re-download), WASM threads
  // capped to 2 on low-memory devices, and an honest low-memory warning
  // before download. See docs/MILESTONE-10.md.
  {
    id: 'Xenova/Qwen1.5-0.5B-Chat',
    name: 'Qwen 1.5 0.5B Chat',
    family: 'Qwen',
    parameters: '0.5B',
    downloadSizeMb: 350,
    requiredRamGb: 1.0,
    runtime: 'wasm_cpu',
    quantization: 'onnx',
    description:
      'Default. Compact chat model; answers 2+2 correctly with its chat template. Validated by milestone-10 (2026-11-21).',
    expectedSha256: null,
    isInstalled: false,
    isLoaded: false,
    isRecommended: true,
  },
  {
    id: 'Xenova/LaMini-Flan-T5-248M',
    name: 'LaMini Flan-T5 248M',
    family: 'Flan-T5',
    parameters: '248M',
    downloadSizeMb: 248,
    requiredRamGb: 0.5,
    runtime: 'wasm_cpu',
    quantization: 'onnx',
    description:
      'Fast instruction model, CPU/WASM, no GPU. Weak at arithmetic — probed 2026-11-21: five prompt shapes all failed 2+2. Kept for instruction tasks, not the default.',
    expectedSha256: null,
    isInstalled: false,
    isLoaded: false,
    isRecommended: false,
  },
  {
    id: 'Xenova/LaMini-Flan-T5-783M',
    name: 'LaMini Flan-T5 783M',
    family: 'Flan-T5',
    parameters: '783M',
    downloadSizeMb: 783,
    requiredRamGb: 1.5,
    runtime: 'wasm_cpu',
    quantization: 'onnx',
    description: 'Larger instruction model with stronger prompt understanding on CPU.',
    expectedSha256: null,
    isInstalled: false,
    isLoaded: false,
    isRecommended: false,
  },
  {
    id: 'Xenova/distilgpt2',
    name: 'DistilGPT-2',
    family: 'GPT-2',
    parameters: '82M',
    downloadSizeMb: 82,
    requiredRamGb: 0.3,
    runtime: 'wasm_cpu',
    quantization: 'onnx',
    description:
      'Instant-loading micro engine. Smallest model in the catalog — but it does NOT answer questions: probed 2026-11-21 it "answered" 2+2 by counting "1.2.1.2.3.4.5.6" (fails the tightened milestone check). Load-anywhere fallback only, never the default, never READY.',
    expectedSha256: null,
    isInstalled: false,
    isLoaded: false,
    isRecommended: false,
  },
];

export const MILESTONE_10_PROMPT = 'What is 2+2? Answer in one word.';
export const MILESTONE_10_EXPECTED = '4';

export class ModelRegistry {
  private status: RegistryStatus = 'OFFLINE';
  private statusMessage = 'Local inference offline.';
  private activeModelId: string = MODEL_CATALOG[0].id;
  private models = new Map<string, ModelDescriptor>(
    MODEL_CATALOG.map((m) => [m.id, { ...m }]),
  );
  private listeners = new Set<() => void>();
  private engine: LocalInferenceEngine;

  constructor(engine: LocalInferenceEngine = localInferenceEngine) {
    this.engine = engine;
  }

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
        /* never break the registry */
      }
    });
  }

  getStatus(): RegistryStatus {
    return this.status;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  getModels(): ModelDescriptor[] {
    return Array.from(this.models.values());
  }

  getActiveModel(): ModelDescriptor | null {
    return this.models.get(this.activeModelId) ?? null;
  }

  private setStatus(status: RegistryStatus, message: string) {
    this.status = status;
    this.statusMessage = message;
    this.notify();
  }

  /** Hardware tier, measured from the real device — never asserted. */
  detectHardware(): { cores: number; memoryGb: number; webgpu: boolean; tier: string } {
    const cores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 0 : 0;
    const memoryGb =
      typeof navigator !== 'undefined'
        ? Math.round(((navigator as any).deviceMemory ?? 0) * 10) / 10
        : 0;
    const webgpu =
      typeof navigator !== 'undefined' && Boolean((navigator as any).gpu);
    const tier = webgpu
      ? 'BALANCED_WEBGPU'
      : cores >= 4
        ? 'BALANCED_WASM'
        : 'LOW_END_WASM';
    return { cores, memoryGb, webgpu, tier };
  }

  /**
   * Install with explicit user consent. The download itself is the engine's
   * real load; this method only gates it on consent and runs the real
   * milestone-10 validation before declaring READY.
   */
  async installWithConsent(modelId: string, consent: boolean): Promise<boolean> {
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model '${modelId}' is not in the registry.`);
    if (!consent) {
      this.setStatus(
        'AWAITING_CONSENT',
        `Download of ${model.name} (${model.downloadSizeMb} MB) requires your approval.`,
      );
      return false;
    }

    this.activeModelId = modelId;
    this.setStatus('DOWNLOADING', `Downloading ${model.name} weights…`);
    const loaded = await this.engine.load(modelId, (p) => {
      this.setStatus('DOWNLOADING', `Downloading ${model.name} weights: ${p.progress}%`);
    });
    if (!loaded) {
      this.setStatus('FAILED', `Download failed: ${this.engine.getState().statusMessage}`);
      return false;
    }

    model.isInstalled = true;
    return this.validateActiveModel();
  }

  /**
   * Milestone-10 validation: the model must answer "2+2" with "4" before it
   * is marked READY. A model that cannot do this is FAILED, not ready.
   */
  async validateActiveModel(): Promise<boolean> {
    const model = this.getActiveModel();
    if (!model) return false;
    this.setStatus('VALIDATING', `Validating ${model.name}: asking "2+2"…`);
    try {
      const result = await this.engine.generate(MILESTONE_10_PROMPT, {
        maxNewTokens: 16,
        temperature: 0,
      });
      const check = checkMilestone10Answer(result.text);
      if (check.pass) {
        model.isLoaded = true;
        this.setStatus(
          'READY',
          `${model.name} operational — answered "2+2" with "${check.matched}" in ${result.elapsedMs} ms (${result.tokensPerSecond} tok/s). Answer: ${result.text.trim().slice(0, 80)}`,
        );
        return true;
      }
      this.setStatus(
        'FAILED',
        `Validation failed: ${model.name} answered "${result.text.trim()}" to "2+2" (expected "4" or "four").`,
      );
      return false;
    } catch (err) {
      this.setStatus(
        'FAILED',
        `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }
}

export const modelRegistry = new ModelRegistry();
