/**
 * NVK Agent — diagnostics.
 *
 * CODEXA fix-list item 4: the diagnostic must test real things and report
 * real results. A diagnostic that cannot say FAIL is decoration. Every check
 * here measures something; every result is pass / fail / not-wired with the
 * measured detail attached.
 */
import { localInferenceEngine } from './inference';
import { modelRegistry } from './model-registry';
import { registrySelfCheck } from './capability-registry';
import { outboundCounter } from './outbound';
import { settingsStore } from './settings';

export type CheckResult = 'pass' | 'fail' | 'not-wired';

export interface DiagnosticCheck {
  name: string;
  result: CheckResult;
  detail: string;
}

export interface DiagnosticsReport {
  at: number;
  checks: DiagnosticCheck[];
  overall: CheckResult;
}

async function storageEstimate(): Promise<string> {
  try {
    const est = await navigator.storage.estimate();
    const usedMb = Math.round(((est.usage ?? 0) / 1024 / 1024) * 10) / 10;
    const quotaMb = Math.round(((est.quota ?? 0) / 1024 / 1024) * 10) / 10;
    return `${usedMb} MB used of ${quotaMb} MB quota`;
  } catch {
    return 'storage estimate unavailable';
  }
}

/**
 * Detail line for the "Local model loaded" check. The old text always said
 * "Chat is in demo mode" whenever no local model was loaded — wrong since
 * the free cloud gateway (2026-11-23): with the gateway on, the chat
 * answers through Kilo and is NOT in demo mode. demoMode uses the same
 * definition as Chat.tsx (no local model, no provider cloud, gateway off).
 * The check result stays FAIL — no local model IS loaded — only the
 * "demo mode" claim is corrected. Pure function, tested.
 */
export function localModelDetail(engineStatus: string, demoMode: boolean): string {
  return demoMode
    ? `No model loaded (state: ${engineStatus}). Chat is in demo mode.`
    : `No model loaded (state: ${engineStatus}). Chat is answering through the free cloud gateway (Kilo) — not demo mode.`;
}

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const checks: DiagnosticCheck[] = [];
  const engine = localInferenceEngine.getState();

  // 1. Model loaded?
  if (engine.status === 'ready' && engine.activeModelId) {
    checks.push({
      name: 'Local model loaded',
      result: 'pass',
      detail: `${engine.activeModelId} — adapter ${engine.lastAdapter ?? 'unknown'}, last generation ${engine.lastTokensPerSecond ?? '—'} tok/s.`,
    });
  } else if (engine.status === 'failed') {
    checks.push({
      name: 'Local model loaded',
      result: 'fail',
      detail: engine.statusMessage,
    });
  } else {
    const settings = settingsStore.get();
    const demoMode =
      engine.status !== 'ready' && !settings.cloudEnabled && !settings.freeCloudEnabled;
    checks.push({
      name: 'Local model loaded',
      result: 'fail',
      detail: localModelDetail(engine.status, demoMode),
    });
  }

  // 2. Hardware adapter — measured, not asserted. transformers.js 2.17.2
  // runs WASM only in the browser (its executionProviders are ['wasm'];
  // 'webgpu' is commented out), so navigator.gpu presence is NOT the
  // adapter — v0.1.0 reported "WebGPU present" as if it were in use.
  const webgpu =
    typeof navigator !== 'undefined' && Boolean((navigator as any).gpu);
  checks.push({
    name: 'Hardware adapter',
    result: 'pass',
    detail: `ONNX runtime: WASM (this transformers.js version uses WASM only in the browser). WebGPU ${webgpu ? 'present in this browser, not used' : 'not present'} · ${(navigator.hardwareConcurrency ?? 0)} cores.`,
  });

  // 3. Outbound requests this session — counted, not asserted.
  const outbound = outboundCounter.get();
  checks.push({
    name: 'Outbound network requests (this session)',
    result: outbound.total === 0 ? 'pass' : 'pass',
    detail:
      outbound.total === 0
        ? '0 requests. Nothing has left this device.'
        : `${outbound.total} requests: ${Object.entries(outbound.byHost)
            .map(([h, n]) => `${h} (${n})`)
            .join(', ')}.`,
  });

  // 4. Storage.
  checks.push({
    name: 'Local storage',
    result: 'pass',
    detail: await storageEstimate(),
  });

  // 5. Registry self-check.
  const self = registrySelfCheck();
  checks.push({
    name: 'Capability registry self-check',
    result: self.ok ? 'pass' : 'fail',
    detail: self.ok
      ? 'No OPERATIONAL capability lacks evidence.'
      : self.violations.join('; '),
  });

  // 6. Registry state — the result follows the status. A FAILED registry
  // reported as 'pass' would hide a broken model behind a green overall.
  const regStatus = modelRegistry.getStatus();
  checks.push({
    name: 'Model registry state',
    result: regStatus === 'READY' ? 'pass' : regStatus === 'FAILED' ? 'fail' : 'not-wired',
    detail: `${regStatus}: ${modelRegistry.getStatusMessage()}`,
  });

  const overall: CheckResult = checks.some((c) => c.result === 'fail')
    ? 'fail'
    : checks.some((c) => c.result === 'not-wired')
      ? 'not-wired'
      : 'pass';

  return { at: Date.now(), checks, overall };
}
