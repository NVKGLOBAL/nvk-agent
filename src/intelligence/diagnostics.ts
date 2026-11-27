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

/**
 * Storage estimate, or null when it cannot be measured. The old code
 * caught the failure and returned the string 'storage estimate
 * unavailable' — which the check then reported as PASS. An unmeasured
 * quota is not a passing check: null means the check FAILS (see
 * runDiagnostics below). In Node navigator.storage does not exist, so
 * this returns null there — the storage check fails honestly outside a
 * browser instead of claiming a quota it never measured.
 */
async function storageEstimate(): Promise<string | null> {
  try {
    const est = await navigator.storage.estimate();
    const usedMb = Math.round(((est.usage ?? 0) / 1024 / 1024) * 10) / 10;
    const quotaMb = Math.round(((est.quota ?? 0) / 1024 / 1024) * 10) / 10;
    return `${usedMb} MB used of ${quotaMb} MB quota`;
  } catch {
    return null;
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

/**
 * Detail line for the "Outbound network requests" check. The old text at
 * zero said "Nothing has left this device" — false whenever the count was
 * merely unrecorded (the pre-fix tally was in-memory only, so a page
 * reload zeroed it after the gateway had already answered). Zero now
 * means only "none counted this session", never a claim about the device.
 * Pure function, tested.
 */
export function outboundDetail(tally: { total: number; byHost: Record<string, number> }): string {
  if (tally.total === 0) return '0 requests counted this session.';
  return `${tally.total} requests: ${Object.entries(tally.byHost)
    .map(([h, n]) => `${h} (${n})`)
    .join(', ')}.`;
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
  // 2026-11-27: this check used to return pass unconditionally. It now
  // FAILS when the hardware cannot be measured at all (no navigator, or
  // hardwareConcurrency unknown/zero) — a check that cannot measure is
  // not a passing check.
  const webgpu =
    typeof navigator !== 'undefined' && Boolean((navigator as any).gpu);
  const cores =
    typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0;
  checks.push(
    cores > 0
      ? {
          name: 'Hardware adapter',
          result: 'pass',
          detail: `ONNX runtime: WASM (this transformers.js version uses WASM only in the browser). WebGPU ${webgpu ? 'present in this browser, not used' : 'not present'} · ${cores} cores.`,
        }
      : {
          name: 'Hardware adapter',
          result: 'fail',
          detail:
            'Cannot measure hardware: no navigator or hardwareConcurrency unknown, so cores and adapter are unmeasured.',
        },
  );

  // 3. Outbound requests this session — counted, not asserted.
  // 2026-11-27: this check used to return pass unconditionally. The
  // counter can throw (a broken tally read); a throw is now a FAIL,
  // not a silent pass.
  try {
    const outbound = outboundCounter.get();
    checks.push({
      name: 'Outbound network requests (this session)',
      result: 'pass',
      detail: outboundDetail(outbound),
    });
  } catch (err) {
    checks.push({
      name: 'Outbound network requests (this session)',
      result: 'fail',
      detail: `Outbound counter unreadable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 4. Storage. 2026-11-27: this check used to return pass
  // unconditionally — even when the estimate threw and nothing was
  // measured. An unavailable estimate is now a FAIL.
  const storage = await storageEstimate();
  checks.push({
    name: 'Local storage',
    result: storage === null ? 'fail' : 'pass',
    detail:
      storage ??
      'Storage estimate unavailable — navigator.storage.estimate() threw or is missing, so usage/quota cannot be measured.',
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
