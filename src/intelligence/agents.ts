/**
 * NVK Agent — agent spawn registry.
 *
 * CODEXA fix-list item 9, built: spawning an agent is a real loop, not a
 * form. Spawn → register → run through the pipeline → record result and
 * evidence. Until an agent completes, its status says so visibly.
 */
import { runPipeline, PipelineResult } from './pipeline';

export type AgentStatus = 'queued' | 'running' | 'complete' | 'failed' | 'blocked';

export interface SubAgent {
  id: string;
  task: string;
  context?: string;
  status: AgentStatus;
  result: PipelineResult | null;
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export class AgentRegistry {
  private agents = new Map<string, SubAgent>();
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
        /* never break the registry */
      }
    });
  }

  list(): SubAgent[] {
    return Array.from(this.agents.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): SubAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Spawn a sub-agent: it is registered immediately (visible in the census),
   * runs the pipeline as a scoped task, and its result + evidence are stored
   * on the record. No spawn ever silently disappears.
   */
  async spawn(task: string, context?: string): Promise<SubAgent> {
    const agent: SubAgent = {
      id: `agent-${Date.now()}-${++this.counter}`,
      task,
      context,
      status: 'queued',
      result: null,
      error: null,
      createdAt: Date.now(),
      finishedAt: null,
    };
    this.agents.set(agent.id, agent);
    this.notify();

    agent.status = 'running';
    this.notify();
    try {
      const result = await runPipeline(task, { subAgentId: agent.id });
      agent.result = result;
      agent.status = result.blocked ? 'blocked' : 'complete';
      agent.finishedAt = Date.now();
    } catch (err) {
      agent.status = 'failed';
      agent.error = err instanceof Error ? err.message : String(err);
      agent.finishedAt = Date.now();
    }
    this.notify();
    return agent;
  }
}

export const agentRegistry = new AgentRegistry();
