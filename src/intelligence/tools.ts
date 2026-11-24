/**
 * NVK Agent — tool registry (MCNA slice 1: revived).
 *
 * Audit verdict was "dead code — zero registered tools, zero imports".
 * The registry is now the only way the agent acts: every tool carries a
 * schema, a permission level, a side-effect class, an evidence format, and
 * an honest unavailable condition. Permission is per call, not per tool:
 * each invocation carries its permission decision, recorded through the
 * existing permission gate before execution for gated tools.
 *
 * Tools do real work or they do not exist — no mock tools. Read-only
 * tools are the default first tools. Slice 1 registers three read-only
 * tools (diagnostics, memory_read, evidence_lookup) plus panel_control
 * (schema + gating; execution resolves through a PanelBus port, slices
 * 2–3 — with no bus attached it returns honest unavailable, never a
 * fake success).
 */
import { permissionGate, ActionCategory } from './permissions';
import { runDiagnostics } from './diagnostics';
import { memoryStore } from './memory';
import { listEvidence, reverifyEvidence } from '../sovereign/evidence';

export interface ToolContext {
  /** Set by the pipeline when the owner approved this restricted run. */
  approvalId?: string;
}

export type ToolPermission = 'none' | 'confirm' | 'approve';
export type ToolSideEffects = 'none' | 'read' | 'write' | 'external';

export interface ToolSchemaField {
  type: string;
  required?: boolean;
  description?: string;
}

/** Tool contract (architecture §6): no tool exists without all of these. */
export interface ToolSchema {
  name: string;
  description: string;
  inputs: Record<string, ToolSchemaField>;
  outputs: Record<string, ToolSchemaField>;
  permission: ToolPermission;
  sideEffects: ToolSideEffects;
  /** What record the call leaves (hash, ledger entry, or none). */
  evidence: string;
  /** The honest condition under which the tool reports unavailable. */
  unavailableWhen: string;
}

export interface Tool extends ToolSchema {
  category: ActionCategory;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
  /**
   * Per-operation permission: panel_control is 'confirm' for state
   * changes and 'none' for reads. When present it resolves the effective
   * permission for this call; `permission` is then the strictest level.
   */
  permissionForInput?: (input: unknown) => ToolPermission;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Schemas only — the contract, without handlers. */
  listSchemas(): ToolSchema[] {
    return this.list().map(({ handler: _h, permissionForInput: _p, ...schema }) => schema);
  }

  /**
   * Execute a tool. Restricted-category tools require a prior approval id
   * from the permission gate; confirm/approve-level tools require one too
   * (obtained via permissionGate.requestTool). Without one the call is
   * refused, never run.
   */
  async execute(name: string, input: unknown, ctx: ToolContext = {}): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (
      (tool.category === 'financial' ||
        tool.category === 'payment' ||
        tool.category === 'publishing' ||
        tool.category === 'destructive' ||
        tool.category === 'external-account') &&
      (!ctx.approvalId || !permissionGate.isApproved(ctx.approvalId))
    ) {
      throw new Error(
        `Tool '${name}' requires explicit owner authorization. Request approval first.`,
      );
    }
    const effectivePermission = tool.permissionForInput?.(input) ?? tool.permission;
    if (
      (effectivePermission === 'confirm' || effectivePermission === 'approve') &&
      (!ctx.approvalId || !permissionGate.isApproved(ctx.approvalId))
    ) {
      throw new Error(
        `Tool '${name}' requires explicit owner authorization (${effectivePermission}). Request approval first.`,
      );
    }
    return tool.handler(input, ctx);
  }
}

export const toolRegistry = new ToolRegistry();

/* ------------------------------------------------------------------ */
/* PanelBus port (slice 1: schema + gating only — no bus is built)     */
/* ------------------------------------------------------------------ */

export interface PanelInfo {
  id: string;
  name: string;
  open: boolean;
  properties: Record<string, unknown>;
}

/** The port slices 2–3 implement. Slice 1 ships with no bus attached. */
export interface PanelBus {
  listPanels(): PanelInfo[];
  getPanel(id: string): PanelInfo | null;
  openPanel(id: string): boolean;
  closePanel(id: string): boolean;
  focusPanel(id: string): boolean;
  setPanelProperty(id: string, property: string, value: unknown): boolean;
}

let panelBus: PanelBus | null = null;

export function attachPanelBus(bus: PanelBus | null): void {
  panelBus = bus;
}

export function getPanelBus(): PanelBus | null {
  return panelBus;
}

/* ------------------------------------------------------------------ */
/* Input helpers                                                       */
/* ------------------------------------------------------------------ */

function asRecord(input: unknown): Record<string, unknown> {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

function boundedLimit(input: Record<string, unknown>, fallback = 20): number {
  const raw = input.limit;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(raw)));
}

/* ------------------------------------------------------------------ */
/* diagnostics — runs the real diagnostics, measured values only       */
/* ------------------------------------------------------------------ */

const diagnosticsTool: Tool = {
  name: 'diagnostics',
  description:
    'Runs the real diagnostics (model state, storage, counted outbound requests) and returns measured values.',
  inputs: {},
  outputs: {
    at: { type: 'number', description: 'Unix timestamp of the run.' },
    overall: { type: 'string', description: 'pass | fail | not-wired.' },
    checks: { type: 'array', description: 'One entry per check, with measured detail.' },
  },
  permission: 'none',
  sideEffects: 'read',
  evidence: 'none — a read-only measurement; the pipeline evidence record covers the run.',
  unavailableWhen: 'never — every check reports a measured result or an honest unavailable detail.',
  category: 'read',
  handler: async () => runDiagnostics(),
};

/* ------------------------------------------------------------------ */
/* memory_read — reads the real memory store, bounded, honest empty    */
/* ------------------------------------------------------------------ */

const memoryReadTool: Tool = {
  name: 'memory_read',
  description:
    'Reads prior turns (or a stored key) from the real memory store, bounded. Returns what was found or an honest empty.',
  inputs: {
    limit: { type: 'number', description: 'Max turns to return (default 20, capped at 100).' },
    query: { type: 'string', description: 'Optional substring filter over turn text.' },
    key: { type: 'string', description: 'Optional raw memory key to read instead of conversation turns.' },
  },
  outputs: {
    found: { type: 'boolean', description: 'Whether anything was found.' },
    turns: { type: 'array', description: 'Matching conversation turns, oldest first.' },
    total: { type: 'number', description: 'Total turns stored (before the limit).' },
    value: { type: 'unknown', description: 'Stored value, when a key was requested.' },
  },
  permission: 'none',
  sideEffects: 'read',
  evidence: 'none — a read-only lookup.',
  unavailableWhen: 'never — an empty store returns an honest empty, not an error.',
  category: 'read',
  handler: async (input) => {
    const args = asRecord(input);
    if (typeof args.key === 'string' && args.key.length > 0) {
      const value = await memoryStore.get(args.key);
      return { found: value !== null, key: args.key, value };
    }
    const turns = await memoryStore.getConversation();
    const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const matched = query
      ? turns.filter((t) => t.text.toLowerCase().includes(query))
      : turns;
    const limit = boundedLimit(args);
    return {
      found: matched.length > 0,
      turns: matched.slice(-limit),
      total: turns.length,
      reason: matched.length === 0 ? 'no matching turns stored' : undefined,
    };
  },
};

/* ------------------------------------------------------------------ */
/* evidence_lookup — reads an evidence record, re-verifies its hash    */
/* ------------------------------------------------------------------ */

const evidenceLookupTool: Tool = {
  name: 'evidence_lookup',
  description:
    'Reads an evidence record by id or hash, re-verifies the hash, and returns verified true/false. A tampered record fails verification.',
  inputs: {
    id: { type: 'string', description: 'Evidence record id (ev-…).' },
    hash: { type: 'string', description: 'Evidence record SHA-256 hash.' },
  },
  outputs: {
    found: { type: 'boolean', description: 'Whether a record matched.' },
    verified: { type: 'boolean', description: 'Whether the stored hash re-verified.' },
    detail: { type: 'string', description: 'Pass/fail detail from the re-verification.' },
    record: { type: 'object', description: 'The evidence record, when found.' },
  },
  permission: 'none',
  sideEffects: 'read',
  evidence: 'the re-verification result itself (found + verified + detail).',
  unavailableWhen: 'when no id or hash is supplied, or no record matches — reported as found: false, never invented.',
  category: 'read',
  handler: async (input) => {
    const args = asRecord(input);
    const id = typeof args.id === 'string' ? args.id : undefined;
    const hash = typeof args.hash === 'string' ? args.hash : undefined;
    if (!id && !hash) {
      return { found: false, verified: false, detail: 'No id or hash supplied.' };
    }
    const all = await listEvidence();
    const record = all.find((r) => (id && r.id === id) || (hash && r.sha256 === hash));
    if (!record) {
      return { found: false, verified: false, detail: `No evidence record matches${id ? ` id ${id}` : ''}${hash ? ` hash ${hash.slice(0, 16)}…` : ''}.` };
    }
    const check = await reverifyEvidence(record.id);
    return { found: true, verified: check.pass, detail: check.detail, record };
  },
};

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Checkpoint / rollback (MCNA slice 11)                               */
/* ------------------------------------------------------------------ */

/**
 * Restore a panel to a snapshot taken before a state-changing call.
 * Replays the snapshot through the PanelBus port (open/close + each
 * property). A failed state-changing tool restores the pre-call
 * snapshot — the panel is never left half-changed. Returns true when
 * the restore replayed without a bus error.
 */
export function restorePanelSnapshot(bus: PanelBus, snapshot: PanelInfo): boolean {
  try {
    if (snapshot.open) bus.openPanel(snapshot.id);
    else bus.closePanel(snapshot.id);
    for (const [property, value] of Object.entries(snapshot.properties)) {
      bus.setPanelProperty(snapshot.id, property, value);
    }
    return true;
  } catch {
    return false;
  }
}

/* panel_control — schema + gating in slice 1; execution in slices 2–3 */
/* ------------------------------------------------------------------ */

const PANEL_READ_ACTIONS = new Set(['list', 'get']);

const panelControlTool: Tool = {
  name: 'panel_control',
  description:
    'Enumerate panels, open/close/focus them, read state, set properties (color, state, content). Reads need no approval; state changes need owner confirmation.',
  inputs: {
    action: { type: 'string', required: true, description: 'list | get | open | close | focus | set.' },
    panelId: { type: 'string', description: 'Panel id (required for get/open/close/focus/set).' },
    property: { type: 'string', description: 'Property to set (required for set).' },
    value: { type: 'unknown', description: 'Value to set (required for set).' },
  },
  outputs: {
    available: { type: 'boolean', description: 'False when no panel bus is attached.' },
    reason: { type: 'string', description: 'Why unavailable, when available is false.' },
    panels: { type: 'array', description: 'Panel list (list action).' },
    panel: { type: 'object', description: 'Panel state (get action).' },
    ok: { type: 'boolean', description: 'Whether the requested change applied.' },
  },
  permission: 'confirm',
  sideEffects: 'write',
  evidence: 'every panel action is an evidence event (slices 2–3).',
  unavailableWhen: 'no panel bus attached — returns { available: false, reason: "no panel bus attached" }, never a fake success.',
  category: 'local-write',
  permissionForInput: (input) => {
    const action = asRecord(input).action;
    return typeof action === 'string' && PANEL_READ_ACTIONS.has(action) ? 'none' : 'confirm';
  },
  handler: async (input) => {
    const args = asRecord(input);
    const action = typeof args.action === 'string' ? args.action : '';
    const bus = getPanelBus();
    if (!bus) {
      return { available: false, reason: 'no panel bus attached' };
    }
    if (action === 'list') {
      return { available: true, panels: bus.listPanels() };
    }
    const panelId = typeof args.panelId === 'string' ? args.panelId : '';
    if (!panelId) {
      return { available: true, ok: false, reason: `action '${action}' requires a panelId` };
    }
    if (action === 'get') {
      const panel = bus.getPanel(panelId);
      return { available: true, panel, found: panel !== null };
    }
    if (action === 'open') return runStateChange(bus, panelId, () => bus.openPanel(panelId));
    if (action === 'close') return runStateChange(bus, panelId, () => bus.closePanel(panelId));
    if (action === 'focus') return runStateChange(bus, panelId, () => bus.focusPanel(panelId));
    if (action === 'set') {
      const property = typeof args.property === 'string' ? args.property : '';
      if (!property) {
        return { available: true, ok: false, reason: "action 'set' requires a property" };
      }
      return runStateChange(bus, panelId, () => bus.setPanelProperty(panelId, property, args.value));
    }
    return { available: true, ok: false, reason: `unknown panel_control action '${action}'` };
  },
};

/**
 * Run a state-changing panel action with a checkpoint (slice 11).
 * Snapshots the panel BEFORE the call; when the call fails (ok: false
 * or a throw) the pre-call snapshot is restored and the failure is
 * returned — the panel is never left half-changed. On success the
 * checkpoint is discarded (the change stands). The restore is recorded
 * on the result (`restored: true`) so it is auditable, never silent.
 */
function runStateChange(
  bus: PanelBus,
  panelId: string,
  apply: () => boolean,
): { available: true; ok: boolean; restored?: boolean; reason?: string } {
  const snapshot = bus.getPanel(panelId);
  try {
    const ok = apply();
    if (ok) return { available: true, ok: true };
    // The call failed — restore the pre-call snapshot.
    const restored = snapshot ? restorePanelSnapshot(bus, snapshot) : false;
    return { available: true, ok: false, restored, reason: 'the panel action failed; the pre-call state was restored' };
  } catch (err) {
    const restored = snapshot ? restorePanelSnapshot(bus, snapshot) : false;
    return {
      available: true,
      ok: false,
      restored,
      reason: `the panel action threw (${err instanceof Error ? err.message : String(err)}); the pre-call state was restored`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* web_fetch + web_search — Sprint 6 (first real connectors)           */
/* ------------------------------------------------------------------ */

/**
 * The gateway for web fetch / web search: the CODEXA Cloudflare
 * Worker (its /fetch and /search endpoints, which fetch server-side
 * with an SSRF guard and honest errors). The Worker allows CORS (*),
 * so this static site can call it cross-origin. The client never
 * fetches a provider directly — the gateway does, and no provider
 * credentials are involved (DuckDuckGo HTML search needs no key).
 * When the gateway cannot serve a request, the tool returns an honest
 * unavailable, never a fabricated page or result.
 */
export const WEB_GATEWAY_BASE = 'https://codexa.nvkglobal.workers.dev';

async function callGateway(path: string, init: RequestInit): Promise<unknown | null> {
  let resp: Response;
  try {
    resp = await fetch(`${WEB_GATEWAY_BASE}${path}`, init);
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  try {
    return (await resp.json()) as unknown;
  } catch {
    return null;
  }
}

const webFetchTool: Tool = {
  name: 'web_fetch',
  description:
    'Fetches a public URL and returns its text through the gateway (server-side, SSRF-guarded, 1 MB cap). Read-only. Returns an honest unavailable when the gateway cannot serve it — never a fabricated page.',
  inputs: {
    url: { type: 'string', required: true, description: 'The public http(s) URL to fetch.' },
  },
  outputs: {
    available: { type: 'boolean', description: 'False when the gateway cannot serve the request.' },
    reason: { type: 'string', description: 'Why unavailable, when available is false.' },
    url: { type: 'string', description: 'The fetched URL.' },
    status: { type: 'number', description: 'The HTTP status of the fetched URL.' },
    text: { type: 'string', description: 'The fetched text (truncated at 1 MB, truncated: true).' },
    truncated: { type: 'boolean', description: 'True when the text was truncated at the 1 MB cap.' },
  },
  permission: 'none',
  sideEffects: 'read',
  evidence: 'the fetched URL + HTTP status + character count (the text itself is the evidence).',
  unavailableWhen: 'when the gateway is unreachable, the URL is not a public http(s) URL, or the content is not text — reported as available: false, never invented.',
  category: 'read',
  handler: async (input) => {
    const args = asRecord(input);
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) {
      return { available: false, reason: 'web_fetch requires a url' };
    }
    const data = (await callGateway('/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })) as { url?: string; status?: number; text?: string; truncated?: boolean } | null;
    if (!data || typeof data.text !== 'string') {
      return { available: false, reason: 'the web gateway could not fetch that URL' };
    }
    return {
      available: true,
      url: data.url ?? url,
      status: data.status ?? 0,
      text: data.text,
      truncated: data.truncated ?? false,
    };
  },
};

const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Searches the web through the gateway (DuckDuckGo HTML, server-side, parsed here). Read-only. Returns real results or an honest empty — never invented sources.',
  inputs: {
    query: { type: 'string', required: true, description: 'The search query.' },
  },
  outputs: {
    available: { type: 'boolean', description: 'False when the gateway cannot serve the request.' },
    reason: { type: 'string', description: 'Why unavailable, when available is false.' },
    query: { type: 'string', description: 'The query that was searched.' },
    results: { type: 'array', description: 'Real results [{title, url, snippet}] (an empty list is a real empty).' },
    count: { type: 'number', description: 'The number of results.' },
  },
  permission: 'none',
  sideEffects: 'read',
  evidence: 'the query + the result list (titles + URLs).',
  unavailableWhen: 'when the gateway is unreachable or the search provider cannot be reached — reported as available: false, never invented.',
  category: 'read',
  handler: async (input) => {
    const args = asRecord(input);
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return { available: false, reason: 'web_search requires a query' };
    }
    const data = (await callGateway(`/search?q=${encodeURIComponent(query)}`, {})) as {
      query?: string;
      results?: { title: string; url: string; snippet: string }[];
      count?: number;
    } | null;
    if (!data || !Array.isArray(data.results)) {
      return { available: false, reason: 'the web gateway could not search right now' };
    }
    return { available: true, query: data.query ?? query, results: data.results, count: data.count ?? data.results.length };
  },
};

/** Register the slice-1 tools on the singleton (idempotent on re-import). */
export function registerSlice1Tools(): void {
  for (const tool of [diagnosticsTool, memoryReadTool, evidenceLookupTool, panelControlTool]) {
    if (!toolRegistry.get(tool.name)) toolRegistry.register(tool);
  }
}

/** Register the Sprint 6 connector tools on the singleton (idempotent on re-import). */
export function registerConnectorTools(): void {
  for (const tool of [webFetchTool, webSearchTool]) {
    if (!toolRegistry.get(tool.name)) toolRegistry.register(tool);
  }
}

registerSlice1Tools();
registerConnectorTools();
