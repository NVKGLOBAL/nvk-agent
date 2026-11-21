/**
 * NVK Agent — outbound request counter.
 *
 * The "0 outbound requests" claim is only true if it is counted. This module
 * wraps fetch so every request the agent makes is tallied by host. The
 * diagnostics page reports the real count. Nothing is blocked here — counting
 * is the honest part; the settings toggle is what keeps the count at zero.
 */
export interface OutboundTally {
  total: number;
  byHost: Record<string, number>;
}

class OutboundCounter {
  private tally: OutboundTally = { total: 0, byHost: {} };
  private wrapped = false;

  /** Install the fetch wrapper once. Safe to call repeatedly. */
  install(): void {
    if (this.wrapped || typeof window === 'undefined') return;
    this.wrapped = true;
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
  }

  get(): OutboundTally {
    return { total: this.tally.total, byHost: { ...this.tally.byHost } };
  }

  reset(): void {
    this.tally = { total: 0, byHost: {} };
  }
}

export const outboundCounter = new OutboundCounter();
