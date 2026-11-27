/**
 * NVK Agent — outbound request counter.
 *
 * The "0 outbound requests" claim is only true if it is counted. This module
 * wraps fetch so every request the agent makes is tallied by host. The
 * diagnostics page reports the real count. Nothing is blocked here — counting
 * is the honest part; the settings toggle is what keeps the count at zero.
 *
 * 2026-11-24 fix (Diagnostics read 0 despite proven gateway answers):
 * the tally was in-memory only, so every page load reset it to 0 — and
 * Diagnostics then claimed "Nothing has left this device", which was false
 * for the session: the gateway POST had happened before the reload (the
 * clear-data retest reloads the page, which is exactly how the 0 was
 * observed). The tally is now persisted across reloads within one browser
 * session: a session id lives in sessionStorage (survives reloads, dies
 * when the tab closes — that IS "this session"), and the tally lives in
 * localStorage under that session id, written through on every record.
 * A true clear (memoryStore.clearAll) resets it — after a clear, 0 is
 * honest again. Only counts + hosts are stored, never request content.
 * When storage is unavailable the counter falls back to memory-only.
 */
export interface OutboundTally {
  total: number;
  byHost: Record<string, number>;
}

const SESSION_KEY = 'nvk-agent:outbound-session';
const TALLY_PREFIX = 'nvk-agent:outbound-tally:';

function tallyKey(sessionId: string): string {
  return `${TALLY_PREFIX}${sessionId}`;
}

function storageAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.sessionStorage !== 'undefined' &&
      typeof window.localStorage !== 'undefined'
    );
  } catch {
    return false;
  }
}

/** The browser-session id: created once per tab session, survives reloads. */
function currentSessionId(): string | null {
  if (!storageAvailable()) return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function readPersistedTally(sessionId: string): OutboundTally | null {
  try {
    const raw = window.localStorage.getItem(tallyKey(sessionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as OutboundTally).total !== 'number' ||
      typeof (parsed as OutboundTally).byHost !== 'object'
    ) {
      return null;
    }
    return parsed as OutboundTally;
  } catch {
    return null;
  }
}

export class OutboundCounter {
  private tally: OutboundTally = { total: 0, byHost: {} };
  private wrapped = false;
  private sessionId: string | null = null;

  /** Install the fetch wrapper once. Safe to call repeatedly. */
  install(): void {
    if (this.wrapped || typeof window === 'undefined') return;
    this.wrapped = true;
    // Restore the tally for this browser session, so a reload does not
    // silently zero a count the session already earned.
    this.sessionId = currentSessionId();
    if (this.sessionId) {
      const restored = readPersistedTally(this.sessionId);
      if (restored) this.tally = restored;
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      try {
        const first = args[0];
        const raw =
          typeof first === 'string' ? first : first instanceof URL ? first.href : first.url;
        const url = new URL(raw, window.location.origin);
        this.record(url.host);
      } catch {
        this.record('unparsed');
      }
      return originalFetch(...args);
    }) as typeof fetch;
  }

  record(host: string): void {
    this.tally.total += 1;
    this.tally.byHost[host] = (this.tally.byHost[host] ?? 0) + 1;
    this.persist();
  }

  get(): OutboundTally {
    return { total: this.tally.total, byHost: { ...this.tally.byHost } };
  }

  reset(): void {
    this.tally = { total: 0, byHost: {} };
    if (this.sessionId) {
      try {
        window.localStorage.removeItem(tallyKey(this.sessionId));
      } catch {
        /* storage is best-effort; the in-memory tally is already zero */
      }
    }
  }

  /** Write-through persistence of the tally for this browser session. */
  private persist(): void {
    if (!this.sessionId) return;
    try {
      window.localStorage.setItem(tallyKey(this.sessionId), JSON.stringify(this.tally));
    } catch {
      /* storage is best-effort; the in-memory tally is still counted */
    }
  }
}

export const outboundCounter = new OutboundCounter();
