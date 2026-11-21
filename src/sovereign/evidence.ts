/**
 * NVK Agent — evidence store (Sovereign Infrastructure layer).
 *
 * Every pipeline result is recorded with a content hash. "Re-Verify Proof"
 * recomputes the hash from the stored payload and reports pass/fail — it is
 * a real check, not a button that does nothing (CODEXA fix-list item 8).
 */
import { memoryStore } from '../intelligence/memory';

export interface EvidenceRecord {
  id: string;
  input: string;
  answer: string;
  modelId: string | null;
  route: string;
  demoMode: boolean;
  intent: string;
  at: number;
  sha256: string;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Non-secure contexts: fall back to a simple non-cryptographic hash and say so.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `nonsecure-${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

const EVIDENCE_KEY = 'evidence';

export async function storeEvidence(
  entry: Omit<EvidenceRecord, 'id' | 'at' | 'sha256'>,
): Promise<EvidenceRecord> {
  const at = Date.now();
  const payload = JSON.stringify({ ...entry, at });
  const record: EvidenceRecord = {
    ...entry,
    id: `ev-${at}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    sha256: await sha256Hex(payload),
  };
  const all = (await memoryStore.get<EvidenceRecord[]>(EVIDENCE_KEY)) ?? [];
  all.push(record);
  await memoryStore.set(EVIDENCE_KEY, all.slice(-500));
  return record;
}

export async function listEvidence(): Promise<EvidenceRecord[]> {
  return (await memoryStore.get<EvidenceRecord[]>(EVIDENCE_KEY)) ?? [];
}

/** Recompute the hash from the stored payload and report pass/fail. Real verification. */
export async function reverifyEvidence(id: string): Promise<{
  found: boolean;
  pass: boolean;
  detail: string;
}> {
  const all = await listEvidence();
  const record = all.find((r) => r.id === id);
  if (!record) return { found: false, pass: false, detail: `No evidence record ${id}.` };
  const payload = JSON.stringify({
    input: record.input,
    answer: record.answer,
    modelId: record.modelId,
    route: record.route,
    demoMode: record.demoMode,
    intent: record.intent,
    at: record.at,
  });
  const recomputed = await sha256Hex(payload);
  const pass = recomputed === record.sha256;
  return {
    found: true,
    pass,
    detail: pass
      ? `PASS — hash matches stored payload (${record.sha256.slice(0, 16)}…).`
      : `FAIL — recomputed hash ${recomputed.slice(0, 16)}… does not match stored ${record.sha256.slice(0, 16)}….`,
  };
}
