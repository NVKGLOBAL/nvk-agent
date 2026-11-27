/**
 * NVK Agent — local-first memory.
 *
 * Conversations, facts, and evidence references live on the device only.
 * Storage order: IndexedDB when available, localStorage fallback, in-memory
 * last resort. Nothing here is ever sent anywhere — there is no sync, no
 * telemetry, no external call in this module.
 */

import { outboundCounter } from './outbound';

export interface MemoryRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface ConversationTurn {
  role: 'user' | 'agent';
  text: string;
  at: number;
  modelId?: string;
  tokensPerSecond?: number | null;
}

const DB_NAME = 'nvk-agent-memory';
const STORE = 'records';
const LS_PREFIX = 'nvk-agent:';

function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function lsAvailable(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Prune the known-broken history that is already stored on the device.
 * Pure function, tested in tests/memory-prune.test.ts.
 *
 * The pre-fix engine (2026-11-21, sampling bug) stored turns the v0.1.3
 * guards never cleaned: a wrong agent reply "1" to 2+2, the same user
 * prompt repeated four times, and prompts with no reply at all. A fresh
 * user must never see wrong or unanswered turns. Rules, in order:
 *   1. Drop empty agent turns.
 *   2. Drop the known-broken single-character agent reply "1".
 *   3. Collapse consecutive identical user prompts, keeping the LAST one
 *      (and its reply) — the earlier repeats are the broken seed.
 *   4. Drop a trailing user turn with no agent reply after it (orphaned)
 *      — but only when it is stale (older than 10 minutes). A prompt whose
 *      reply is still in flight is seconds old and must be kept: the
 *      pipeline appends the user turn first and the agent reply second,
 *      so pruning a fresh trailing prompt would delete the user's own
 *      question before its answer lands.
 * Idempotent: pruning a pruned list changes nothing. Legitimate history
 * (distinct prompts, real replies) passes through untouched.
 */
export function pruneConversation(turns: ConversationTurn[]): ConversationTurn[] {
  const kept: ConversationTurn[] = [];
  for (const turn of turns) {
    if (turn.role === 'agent' && turn.text.trim() === '') continue;
    if (turn.role === 'agent' && turn.text.trim() === '1') continue;
    if (
      turn.role === 'user' &&
      kept.length > 0 &&
      kept[kept.length - 1].role === 'user' &&
      kept[kept.length - 1].text === turn.text
    ) {
      // Earlier identical prompt, no reply between them: keep the last.
      kept[kept.length - 1] = turn;
      continue;
    }
    kept.push(turn);
  }
  // Trailing orphaned prompt: the user asked and no answer ever came back.
  // Only stale orphans (the broken seeded history is hours old); a prompt
  // sent seconds ago may still be waiting for its reply.
  const last = kept[kept.length - 1];
  if (last && last.role === 'user' && Date.now() - last.at > 10 * 60 * 1000) {
    kept.pop();
  }
  return kept;
}

/**
 * Slice 4 (MCNA memory): build a bounded history transcript for the
 * generation prompt. Memory is read into prompts in a bounded window, or
 * it is not memory — it is a log. Takes the most recent turns (newest
 * first so the most recent survive a cap), under a token cap enforced in
 * code (estimated chars/4 — an estimate; the real tokenizer count is
 * used when a model is loaded, but the window must be bounded before the
 * model is ever called). Returns '' when there is no history, so a
 * first turn is byte-identical to before (the validated 2+2 path is
 * untouched on a fresh conversation). Pure function, tested.
 */
export function buildHistoryTranscript(
  turns: ConversationTurn[],
  opts: { maxTurns?: number; maxTokens?: number } = {},
): string {
  const maxTurns = opts.maxTurns ?? 4;
  const maxTokens = opts.maxTokens ?? 512;
  const usable = (turns || []).filter((t) => t && t.text && t.text.trim());
  if (usable.length === 0) return '';
  const newestFirst = usable.slice(-maxTurns).reverse();
  const included: ConversationTurn[] = [];
  let tokens = 0;
  for (const turn of newestFirst) {
    const cost = Math.ceil(turn.text.length / 4);
    if (tokens + cost > maxTokens) break;
    included.push(turn);
    tokens += cost;
  }
  included.reverse();
  if (included.length === 0) return '';
  const lines = included.map((t) =>
    t.role === 'agent' ? `Assistant: ${t.text.trim()}` : `User: ${t.text.trim()}`,
  );
  return `Earlier in this conversation:\n${lines.join('\n')}\n\n`;
}

export class MemoryStore {
  private mem = new Map<string, MemoryRecord>();
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (!idbAvailable()) return Promise.reject(new Error('IndexedDB unavailable'));
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        // A failed open must not poison every later call: the rejected
        // promise used to stay cached in dbPromise forever, so every
        // later get/set/clear silently fell through to (or skipped)
        // the other store. Drop it so the next call retries the open.
        this.dbPromise = null;
        reject(req.error);
      };
    });
    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    if (idbAvailable()) {
      try {
        const db = await this.openDb();
        const value = await new Promise<T | null>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(key);
          req.onsuccess = () => resolve((req.result as MemoryRecord | undefined)?.value as T ?? null);
          req.onerror = () => reject(req.error);
        });
        if (value !== null) return value;
      } catch {
        /* fall through to localStorage */
      }
    }
    if (lsAvailable()) {
      const raw = localStorage.getItem(LS_PREFIX + key);
      if (raw !== null) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return null;
        }
      }
    }
    return (this.mem.get(key)?.value as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    const record: MemoryRecord = { key, value, updatedAt: Date.now() };
    this.mem.set(key, record);
    if (idbAvailable()) {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const req = tx.objectStore(STORE).put(record);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
        // Write-through mirror (2026-11-23): get() reads IndexedDB
        // first and only falls back to localStorage, while set() used
        // to write exactly one store — so the two copies could diverge
        // and the older one silently shadow the newer one. A fresh
        // exchange written to the fallback copy vanished on reload
        // while older history (in IndexedDB) survived. Mirror
        // best-effort; a failed mirror never breaks the write.
        if (lsAvailable()) {
          try {
            localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
          } catch {
            /* ignore */
          }
        }
        return;
      } catch {
        /* fall through to localStorage */
      }
    }
    if (lsAvailable()) {
      try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
      } catch {
        /* storage full or blocked — memory copy still holds it */
      }
    }
  }

  async appendTurn(turn: ConversationTurn): Promise<void> {
    // Empty turns are never stored: the pre-fix engine produced empty agent
    // replies that persisted as broken-looking blank bubbles (2026-11-21).
    // Rendering filters them too (Chat.tsx), this stops new ones at source.
    if (turn.text.trim() === '') return;
    // Read through getConversation() so the stored list is pruned as it
    // grows: the broken pre-fix history (wrong "1" reply, repeated
    // prompts, orphaned turns) is cleaned on the next append, not kept
    // forever (2026-11-22, v0.1.4).
    const turns = await this.getConversation();
    turns.push(turn);
    await this.set('conversation', turns.slice(-200));
  }

  async getConversation(): Promise<ConversationTurn[]> {
    // Read-time prune: the broken history already on the device is cleaned
    // when read, so a fresh user never sees it (2026-11-22, v0.1.4).
    const turns = (await this.get<ConversationTurn[]>('conversation')) ?? [];
    return pruneConversation(turns);
  }

  /**
   * Clear everything this app stored on the device and verify the clear
   * through the same read path the UI uses. Returns true only when the
   * conversation the chat reads is actually gone afterwards — a clear
   * that silently skipped a store must report false, not pretend success.
   */
  async clearAll(): Promise<boolean> {
    this.mem.clear();
    if (idbAvailable()) {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const req = tx.objectStore(STORE).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch {
        // A failed open/clear must not stop the other stores being
        // cleared below, and must not leave a poisoned cached promise
        // behind (see openDb).
        this.dbPromise = null;
      }
      // Belt-and-braces: drop the whole database so no record survives
      // in a store the clear above could not reach. Fire-and-forget: a
      // blocked delete (another tab holding the DB) must never hang the
      // clear — the store-clear above already emptied the records. The
      // cached connection is dropped once the delete settles, so the
      // next open re-creates a fresh database instead of reusing a
      // connection to a deleted one.
      try {
        const del = indexedDB.deleteDatabase(DB_NAME);
        del.onsuccess = () => {
          this.dbPromise = null;
        };
        del.onerror = () => {
          this.dbPromise = null;
        };
        del.onblocked = () => {
          this.dbPromise = null;
        };
      } catch {
        this.dbPromise = null;
      }
    }
    if (lsAvailable()) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
    // The outbound-request tally is device state too: a true clear zeroes
    // it, so Diagnostics after a clear honestly reads 0 "counted this
    // session" instead of carrying pre-clear traffic. (The Kilo toggle
    // staying checked after a clear is the factory default, not a failure;
    // the count resetting is the intended counterpart.)
    outboundCounter.reset();
    // v0.1.8: the model weights do NOT live in IndexedDB or
    // localStorage — they live in the Cache API store 'transformers-cache'
    // (see inference.ts isModelWeightsCached), which clearAll() never
    // touched. That is why "Clear all local data" left ~466.8 MB of
    // weights behind (retest #4 / nav-UX diagnosis G1). Delete the
    // app's own model cache; no other cache is touched.
    if (typeof caches !== 'undefined') {
      try {
        await caches.delete('transformers-cache');
      } catch {
        /* ignore */
      }
    }
    // Verify, don't assert: read the conversation back through the same
    // path the chat UI uses. false = some data survived — the caller
    // must say so instead of showing "cleared".
    try {
      return (await this.get<ConversationTurn[]>('conversation')) === null;
    } catch {
      return false;
    }
  }
}

export const memoryStore = new MemoryStore();
