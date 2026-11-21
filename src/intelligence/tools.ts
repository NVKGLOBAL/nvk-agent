/**
 * NVK Agent — tool registry.
 *
 * One capability, one execution path: every tool is registered here with its
 * category, and restricted tools run only through the permission gate.
 * Tools do real work or they do not exist — no mock tools.
 */
import { permissionGate, ActionCategory } from './permissions';

export interface ToolContext {
  /** Set by the pipeline when the owner approved this restricted run. */
  approvalId?: string;
}

export interface Tool {
  name: string;
  description: string;
  category: ActionCategory;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
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

  /**
   * Execute a tool. Restricted tools require a prior approval id from the
   * permission gate; without one the call is refused, never run.
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
    return tool.handler(input, ctx);
  }
}

export const toolRegistry = new ToolRegistry();
