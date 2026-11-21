/**
 * NVK Agent — agent census (spawn registry).
 *
 * CODEXA fix-list item 9, built: the spawn form is a real loop. Spawned
 * agents appear in the registry, run, and report a result with evidence.
 */
import { useEffect, useState } from 'react';
import { agentRegistry, SubAgent } from '../../intelligence/agents';

export function AgentsPanel() {
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [agents, setAgents] = useState<SubAgent[]>(agentRegistry.list());
  const [spawning, setSpawning] = useState(false);

  useEffect(() => agentRegistry.subscribe(() => setAgents(agentRegistry.list())), []);

  async function spawn() {
    if (!task.trim() || spawning) return;
    setSpawning(true);
    try {
      await agentRegistry.spawn(task.trim(), context.trim() || undefined);
      setTask('');
      setContext('');
    } finally {
      setSpawning(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <h2>Agent Census</h2>
      <p style={styles.small}>
        Spawned agents run the pipeline as scoped tasks and report a result
        with evidence. Nothing spawns silently; nothing disappears.
      </p>
      <div style={styles.form}>
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Task description…"
          aria-label="Task description"
          style={styles.input}
        />
        <input
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context (optional)"
          aria-label="Context"
          style={styles.input}
        />
        <button onClick={spawn} disabled={!task.trim() || spawning} style={styles.button}>
          {spawning ? 'Spawning…' : 'Spawn agent'}
        </button>
      </div>
      {agents.length === 0 && <p style={styles.small}>No sub-agents spawned yet.</p>}
      <ul style={styles.list}>
        {agents.map((a) => (
          <li key={a.id} style={styles.item}>
            <strong>{a.task}</strong> — <span>{a.status.toUpperCase()}</span>
            {a.context && <div style={styles.small}>Context: {a.context}</div>}
            {a.result && (
              <div style={styles.small}>
                Answer: {a.result.answer.slice(0, 200)}
                {a.result.evidenceId ? ` · evidence ${a.result.evidenceId}` : ''}
              </div>
            )}
            {a.error && <div role="alert">Error: {a.error}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input: {
    background: '#0a121c',
    color: '#e8eef4',
    border: '1px solid #2a3b4d',
    borderRadius: 10,
    padding: '10px 12px',
    flex: 1,
    minWidth: 200,
  },
  button: {
    background: '#00e5ff',
    color: '#04121a',
    border: 'none',
    borderRadius: 10,
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  list: { listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  item: { border: '1px solid #1d2b3a', borderRadius: 12, padding: 12 },
  small: { fontSize: 13, color: '#8fa3b8' },
};
