/**
 * NVK Agent — checkpoint / rollback (MCNA slice 11).
 *
 * A state-changing tool call snapshots the relevant state FIRST, and a
 * failure restores the snapshot. Built BEFORE any state-changing tool is
 * enabled, not after. The snapshot is a deep copy (JSON round-trip) of
 * the state the tool will change; a restore puts it back exactly; a
 * commit discards the checkpoint (the change succeeded). Every
 * checkpoint + restore + commit is recorded (the caller writes it to
 * the evidence store / run trace) so a rollback is auditable, never
 * silent.
 *
 * Pure, dependency-light, tested in tests/checkpoint.test.ts.
 */

export interface Checkpoint<T> {
  id: string;
  at: number;
  /** The snapshot (a deep copy of the state before the change). */
  state: T;
}

export class CheckpointStore<T> {
  private checkpoints = new Map<string, Checkpoint<T>>();

  // Snapshot the state before a state-changing call. Returns the
  // checkpoint id. The state is deep-copied (JSON) so later mutation of
  // the live state cannot corrupt the snapshot.
  public snapshot(state: T): string {
    const id = `ckpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const copy = JSON.parse(JSON.stringify(state)) as T;
    this.checkpoints.set(id, { id, at: Date.now(), state: copy });
    return id;
  }

  // Restore the state from a checkpoint. Returns a deep copy of the
  // snapshotted state (so the caller gets its own copy, not the stored
  // one). Throws when the checkpoint does not exist — a restore of a
  // missing checkpoint is never silently skipped.
  public restore(id: string): T {
    const ckpt = this.checkpoints.get(id);
    if (!ckpt) {
      throw new Error(`Checkpoint "${id}" does not exist — a restore of a missing checkpoint is never silently skipped.`);
    }
    return JSON.parse(JSON.stringify(ckpt.state)) as T;
  }

  // Commit a checkpoint (the change succeeded) — discard the snapshot.
  public commit(id: string): void {
    this.checkpoints.delete(id);
  }

  public has(id: string): boolean {
    return this.checkpoints.has(id);
  }

  public count(): number {
    return this.checkpoints.size;
  }
}

// Run a state-changing call with a checkpoint: snapshot the state, run
// the call, and on failure restore the snapshot INTO the caller's state
// object (in place, so the live state is the pre-change state again)
// and rethrow. On success the checkpoint is committed (discarded). The
// caller records the checkpoint id + the outcome in the evidence store /
// run trace.
export async function withCheckpoint<T extends Record<string, unknown>>(
  store: CheckpointStore<T>,
  state: T,
  call: () => Promise<void>,
): Promise<{ checkpointId: string; restored: boolean }> {
  const checkpointId = store.snapshot(state);
  try {
    await call();
    store.commit(checkpointId);
    return { checkpointId, restored: false };
  } catch (err) {
    const restored = store.restore(checkpointId);
    // Apply the snapshot back into the caller's state object (in place).
    for (const key of Object.keys(state)) {
      delete (state as Record<string, unknown>)[key];
    }
    Object.assign(state, restored);
    store.commit(checkpointId);
    throw err;
  }
}
