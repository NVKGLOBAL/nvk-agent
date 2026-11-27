/**
 * NVK Agent — registry honesty + capability fixes (2026-11-27).
 *
 * Proof tests for the ten verified gaps closed 2026-11-27:
 *  1. Registry lists what actually works (cloud-gateway, web-search,
 *     web-fetch OPERATIONAL; voice + relay PARTIAL).
 *  2. No Gemini path ships in the runtime.
 *  3. No "no cloud, no account" copy.
 *  4. Settings + payments registry evidence is correct.
 *  5. lastVerified refreshed only for what Nov 27 proved (milestone-10
 *     / local-inference pins untouched — see capability-registry.test.ts).
 *  6. Orb title hidden on the 340px phone canvas; mode selector wired.
 *  7. On-device permission approval UI exists in Diagnostics.
 *  8. Blocked pipeline runs emit all 11 stages.
 *  9. Diagnostics storage/hardware/outbound checks can fail.
 * 10. inference.ts header names the real default model.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CAPABILITIES, getCapability } from '../src/intelligence/capability-registry';
import { INFERENCE_MODELS } from '../src/intelligence/inference';
import { OrbMode } from '../src/experience/orb/vendor/osTypes';
import { runPipeline } from '../src/intelligence/pipeline';
import { runDiagnostics } from '../src/intelligence/diagnostics';
import { settingsStore } from '../src/intelligence/settings';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const readSrc = (rel: string) => readFileSync(join(root, 'src', rel), 'utf8');

/* --- 1. Register what actually works ---------------------------------- */

test('registry 2026-11-27: the new ids exist with non-empty evidence', () => {
  for (const id of ['cloud-gateway', 'web-search', 'web-fetch', 'voice', 'relay']) {
    const cap = getCapability(id);
    assert.ok(cap, `${id} is missing from the registry`);
    assert.ok(cap.evidence.trim().length > 0, `${id} has no evidence`);
  }
  assert.equal(getCapability('cloud-gateway')!.status, 'OPERATIONAL');
  assert.equal(getCapability('web-search')!.status, 'OPERATIONAL');
  assert.equal(getCapability('web-fetch')!.status, 'OPERATIONAL');
  assert.equal(getCapability('voice')!.status, 'PARTIAL');
  assert.equal(getCapability('relay')!.status, 'PARTIAL');
});

test('registry 2026-11-27: no OPERATIONAL entry lacks a live or unit-test basis', () => {
  for (const c of CAPABILITIES) {
    if (c.status !== 'OPERATIONAL') continue;
    // A live run ("Live 2026-11-27") or a named unit-test file is the
    // basis — a bare claim ("it works") is not evidence.
    assert.ok(
      /Live 2026-11-27|tests\/[a-z0-9-]+\.test\.ts|test:milestone-10|PASSED 2026-11-2|implements all 11 stages|Registry loads|denies .* unless|persists to IndexedDB|records .* with content hashes|Vendored from|spawn registers the agent|provider cloud OFF by default/.test(
        c.evidence,
      ),
      `${c.id} is OPERATIONAL without a live or unit-test basis: ${c.evidence.slice(0, 120)}`,
    );
  }
});

test('registry 2026-11-27: MD and TS stay in sync (status + evidence)', () => {
  const md = readFileSync(join(root, 'CAPABILITY-REGISTRY.md'), 'utf8');
  // TS id -> fragment of the MD row name (MD names are shortened).
  const mdName: Record<string, string> = {
    'local-inference': 'Local inference',
    'milestone-10-validation': 'Milestone-10 validation test',
    'agent-pipeline': 'Agent pipeline',
    'capability-registry': 'Capability registry',
    'permission-gate': 'Permission gate',
    memory: 'Local-first memory',
    diagnostics: 'Diagnostics',
    settings: 'System Settings',
    'agent-spawn': 'Agent spawn',
    'nexus-orb': 'Nexus orb',
    'resonance-visualizer': 'Resonance visualizer',
    'knowledge-graph': 'Knowledge graph',
    'cloud-gateway': 'Free cloud gateway',
    'web-search': 'Web search',
    'web-fetch': 'Web fetch',
    voice: 'Voice commands',
    relay: 'Phone control',
    'cloud-gemini': 'Cloud provider — Gemini',
    'cloud-openai': 'Cloud provider — OpenAI',
    payments: 'Payments / checkout',
    'wallet-chain': 'Wallet / chain / explorer',
    publishing: 'Publishing',
    'evidence-store': 'Evidence store',
  };
  for (const c of CAPABILITIES) {
    const name = mdName[c.id];
    assert.ok(name, `no MD row mapped for ${c.id}`);
    const row = md.split('\n').find((l) => l.includes(`| ${name} `) || l.includes(`| ${name} |`));
    assert.ok(row, `MD is missing a row for ${c.id} (${name})`);
    assert.ok(
      row.includes(`| ${c.status} |`),
      `MD/TS status drift for ${c.id}: MD row says ${row.trim().slice(0, 160)}`,
    );
    assert.ok(
      row.replaceAll('`', '').includes(c.evidence.slice(0, 60)),
      `MD/TS evidence drift for ${c.id}: MD row does not carry the TS evidence`,
    );
  }
});

/* --- 2. No Gemini path ships ------------------------------------------ */

test('no-gemini 2026-11-27: the runtime files carry no Gemini endpoint or provider', () => {
  for (const rel of [
    'intelligence/router.ts',
    'intelligence/settings.ts',
    'experience/chat/SettingsPanel.tsx',
  ]) {
    const src = readSrc(rel);
    assert.doesNotMatch(src, /gemini/i, `${rel} still mentions Gemini`);
    assert.doesNotMatch(src, /generativelanguage\.googleapis\.com/, `${rel} still calls the Gemini endpoint`);
  }
  // The endpoint must not appear anywhere under src/ at all.
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  for (const file of walk(join(root, 'src'))) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /generativelanguage\.googleapis\.com/,
      `${file} still calls the Gemini endpoint`,
    );
  }
  // The registry keeps the id 'cloud-gemini' deliberately as the MISSING
  // record of the removal — that is the reclassification, not a path.
  assert.equal(getCapability('cloud-gemini')!.status, 'MISSING');
  assert.match(getCapability('cloud-gemini')!.evidence, /Removed per owner direction/);
  // Types narrowed: no 'gemini' route or provider remains.
  assert.doesNotMatch(readSrc('intelligence/router.ts'), /cloud-gemini/);
  assert.match(readSrc('intelligence/settings.ts'), /cloudProvider: 'openai' \| null/);
});

/* --- 3. Honest "no cloud" copy ---------------------------------------- */

test('copy 2026-11-27: neither App nor hero-content claims "no cloud"', () => {
  for (const rel of ['App.tsx', 'experience/hero-content.ts']) {
    const src = readSrc(rel);
    assert.doesNotMatch(src, /no cloud, no account/i, `${rel} still claims "no cloud, no account"`);
    assert.doesNotMatch(src, /cloud only by explicit opt-in/i, `${rel} still claims cloud is opt-in-only`);
  }
  assert.match(readSrc('App.tsx'), /free cloud gateway by default/);
  assert.match(readSrc('experience/hero-content.ts'), /free cloud gateway/);
});

/* --- 4. Settings + payments evidence ----------------------------------- */

test('registry 2026-11-27: settings + payments evidence is correct', () => {
  const settings = getCapability('settings')!;
  assert.match(settings.evidence, /provider cloud OFF by default/);
  assert.match(settings.evidence, /free cloud gateway ON by default/);
  const payments = getCapability('payments')!;
  assert.match(payments.evidence, /1-day trial/);
  assert.match(payments.evidence, /\$20\/mo/);
  assert.doesNotMatch(payments.evidence, /1 week free/);
});

/* --- 5. Pinned dates untouched ----------------------------------------- */

test('registry 2026-11-27: milestone-10 / local-inference pins did not move', () => {
  // Nov 27 did not re-prove local inference or milestone-10, so the
  // 2026-11-22 pins stand (the registry test pins the same dates).
  assert.equal(getCapability('milestone-10-validation')!.lastVerified, '2026-11-22');
  assert.equal(getCapability('local-inference')!.lastVerified, '2026-11-22');
  assert.equal(getCapability('cloud-gateway')!.lastVerified, '2026-11-27');
  assert.equal(getCapability('nexus-orb')!.lastVerified, '2026-11-27');
  assert.equal(getCapability('diagnostics')!.lastVerified, '2026-11-27');
});

/* --- 6. Orb overlap + mode selector ------------------------------------ */

test('orb 2026-11-27: the "Select a system node" title is hidden on the phone canvas', () => {
  const src = readSrc('experience/orb/vendor/CodexOrbSystem.tsx');
  assert.match(src, /Select a system node/);
  // Hidden below 700px width (the 340px phone canvas); shown at >=700px
  // where the canvas is 420px tall and the title clears the orb.
  assert.match(src, /hidden min-\[700px\]:block/);
});

test('orb 2026-11-27: 11 modes defined, selector wired in OrbHost', () => {
  assert.equal(Object.values(OrbMode).length, 11);
  assert.ok(Object.values(OrbMode).includes(OrbMode.HolographicCore));
  const host = readSrc('experience/orb/OrbHost.tsx');
  assert.match(host, /orbMode=\{orbMode\}/, 'OrbHost does not pass orbMode into the renderer');
  assert.match(host, /Object\.values\(OrbMode\)/, 'OrbHost has no mode selector over the 11 modes');
  assert.match(host, /aria-label="Orb mode"/);
  const orb = getCapability('nexus-orb')!;
  assert.match(orb.evidence, /11 orb modes defined/);
  assert.match(orb.evidence, /mode selector|selector over all 11 modes/);
});

/* --- 7. On-device permission approval UI ------------------------------- */

test('approvals 2026-11-27: Diagnostics lists pending requests with Approve/Deny', () => {
  const src = readSrc('experience/chat/DiagnosticsPanel.tsx');
  assert.match(src, /Pending approvals/);
  assert.match(src, /permissionGate\.pending\(\)/);
  assert.match(src, /permissionGate\.approve\(req\.id\)/);
  assert.match(src, /permissionGate\.deny\(req\.id\)/);
});

/* --- 8. Blocked runs emit all 11 stages ------------------------------- */

test('pipeline 2026-11-27: a permission-blocked run emits all 11 stages', async () => {
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const result = await runPipeline('Post this to X', {
    requestedAction: { category: 'publishing', action: 'post to X', detail: 'test post' },
  });
  assert.equal(result.blocked, true);
  assert.equal(result.stages.length, 11, `blocked run emitted ${result.stages.length} stages, expected 11`);
  const names = result.stages.map((s) => s.stage);
  for (const stage of ['input', 'intent', 'context', 'reasoning', 'planning', 'capability', 'permission', 'execution', 'verification', 'evidence', 'result']) {
    assert.ok(names.includes(stage as never), `blocked run is missing the ${stage} stage`);
  }
  const execution = result.stages.find((s) => s.stage === 'execution')!;
  const evidence = result.stages.find((s) => s.stage === 'evidence')!;
  assert.match(execution.note ?? '', /skipped — blocked/);
  assert.match(evidence.note ?? '', /skipped — blocked/);
  assert.equal(result.evidenceId, null, 'a blocked run stores no evidence');
});

/* --- 9. Diagnostics can fail ------------------------------------------- */

test('diagnostics 2026-11-27: the storage check fails when the estimate is unavailable', async () => {
  // In Node navigator.storage does not exist, so the estimate is
  // unmeasurable — the check must FAIL, not pass with a shrug.
  const report = await runDiagnostics();
  const storage = report.checks.find((c) => c.name === 'Local storage');
  assert.ok(storage, 'Local storage check missing');
  assert.equal(storage.result, 'fail');
  assert.match(storage.detail, /unavailable|cannot be measured/);
});

test('diagnostics 2026-11-27: hardware / outbound / storage checks have fail branches', () => {
  const src = readSrc('intelligence/diagnostics.ts');
  // Hardware: fail when cores cannot be measured.
  assert.match(src, /Cannot measure hardware/);
  // Outbound: fail when the counter throws.
  assert.match(src, /Outbound counter unreadable/);
  // Storage: null estimate -> fail, never a passing shrug.
  assert.doesNotMatch(src, /return 'storage estimate unavailable'/);
  assert.match(src, /storage === null \? 'fail' : 'pass'/);
});

/* --- 10. Default-model header ------------------------------------------ */

test('inference 2026-11-27: the header names the real default model', () => {
  const src = readSrc('intelligence/inference.ts');
  assert.match(src, /Default model: Xenova\/Qwen1\.5-0\.5B-Chat/);
  assert.doesNotMatch(src, /Default model: Xenova\/LaMini-Flan-T5-248M/);
  assert.equal(INFERENCE_MODELS[0].id, 'Xenova/Qwen1.5-0.5B-Chat');
});
