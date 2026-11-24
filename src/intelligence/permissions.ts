/**
 * NVK Agent — permission gate.
 *
 * Unification Directive §5 + §8: financial, payment, publishing, destructive,
 * and external-account actions REQUIRE explicit owner authorization.
 * Default is DENY. An approval covers one action in one session — never a
 * blanket, never silent, never inherited from a previous approval.
 */
export type RestrictedCategory =
  | 'financial'
  | 'payment'
  | 'publishing'
  | 'destructive'
  | 'external-account';

export type ActionCategory = RestrictedCategory | 'read' | 'generate' | 'local-write';

export interface AuthorizationRequest {
  id: string;
  /**
   * Restricted categories gate financial/payment/publishing/destructive/
   * external-account actions. 'tool' is a generic tool-call approval
   * (MCNA slice 1): a confirm/approve-level tool call that is not itself
   * a restricted-category action. It is never treated as restricted —
   * isRestricted('tool') is false.
   */
  category: RestrictedCategory | 'tool';
  action: string;
  detail: string;
  requestedAt: number;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

const RESTRICTED: ReadonlySet<RestrictedCategory> = new Set([
  'financial',
  'payment',
  'publishing',
  'destructive',
  'external-account',
]);

export function isRestricted(category: ActionCategory): category is RestrictedCategory {
  return RESTRICTED.has(category as RestrictedCategory);
}

/**
 * In-session authorization gate. The UI presents pending requests to the
 * owner; nothing restricted executes until its request is approved.
 */
export class PermissionGate {
  private requests = new Map<string, AuthorizationRequest>();
  private listeners = new Set<() => void>();
  private counter = 0;

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
        /* never break the gate */
      }
    });
  }

  request(category: RestrictedCategory, action: string, detail: string): AuthorizationRequest {
    const req: AuthorizationRequest = {
      id: `auth-${Date.now()}-${++this.counter}`,
      category,
      action,
      detail,
      requestedAt: Date.now(),
      status: 'pending',
    };
    this.requests.set(req.id, req);
    this.notify();
    return req;
  }

  /**
   * Generic approval for a confirm/approve-level tool call (MCNA slice 1).
   * The tool call is not a restricted-category action, so it does not
   * borrow a restricted category — it gets its own 'tool' request, approved
   * or denied the same way, one call in one session. approve()/deny()/
   * isApproved() work on it exactly as on restricted requests.
   */
  requestTool(toolName: string, action: string, detail: string): AuthorizationRequest {
    const req: AuthorizationRequest = {
      id: `tool-auth-${Date.now()}-${++this.counter}`,
      category: 'tool',
      action: `tool:${toolName}:${action}`,
      detail,
      requestedAt: Date.now(),
      status: 'pending',
    };
    this.requests.set(req.id, req);
    this.notify();
    return req;
  }

  approve(id: string): boolean {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    this.notify();
    return true;
  }

  deny(id: string): boolean {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'denied';
    this.notify();
    return true;
  }

  isApproved(id: string): boolean {
    return this.requests.get(id)?.status === 'approved';
  }

  pending(): AuthorizationRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
  }

  history(): AuthorizationRequest[] {
    return Array.from(this.requests.values()).sort((a, b) => b.requestedAt - a.requestedAt);
  }
}

export const permissionGate = new PermissionGate();
