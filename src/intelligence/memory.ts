/**
 * NVK Agent — local-first memory.
 *
 * Conversations, facts, and evidence references live on the device only.
 * Storage order: IndexedDB when available, localStorage fallback, in-memory
 * last resort. Nothing here is ever sent anywhere — there is no sync, no
 * telemetry, no external call in this module.
 */

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
      req.onerror = () => reject(req.error);
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
    const turns = (await this.get<ConversationTurn[]>('conversation')) ?? [];
    turns.push(turn);
    await this.set('conversation', turns.slice(-200));
  }

  async getConversation(): Promise<ConversationTurn[]> {
    return (await this.get<ConversationTurn[]>('conversation')) ?? [];
  }

  async clearAll(): Promise<void> {
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
        /* ignore */
      }
    }
    if (lsAvailable()) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
  }
}

export const memoryStore = new MemoryStore();
