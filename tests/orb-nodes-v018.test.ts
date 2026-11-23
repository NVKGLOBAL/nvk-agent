/**
 * NVK Agent — orb node rebuild tests (v0.1.8, 2026-11-22).
 *
 * Run: npm test
 *
 * The owner directed (2026-11-22) that the legacy Nexus gateway nodes
 * (The Vision / The Codex / The Nexus / The Lore, with their MythoTech
 * project lists and the ProjectViewer modal) be removed and the orb
 * nodes rebuilt as agent management / system information: Agents,
 * Evidence, Diagnostics, System — each opening a real panel.
 *
 * These tests prove, at the code level:
 * 1. The node list is exactly the four approved nodes, each with a
 *    real panel — and the legacy gateway identifiers are gone from src/.
 * 2. The Evidence panel is real: it reads the actual evidence store
 *    (hashed records) and shows an honest empty state.
 * 3. All four node labels are visible at once: the nodes sit in a
 *    fixed front arc (pure geometry — every node z > 0, camera side)
 *    and the ring never rotates.
 * 4. The empty-black panel is reframed: the camera starts tilted so
 *    the galaxy disk and ring fill the frame, and the desktop panel
 *    is 420px (which also brings the example prompts onto the first
 *    screen — retest #4).
 *
 * A live-browser visual check is still owed after deploy (subagents
 * have no browser): confirm all four labels render at once, the panel
 * reads as a full orb view, and the prompts are above the fold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NVK_AGENT_NODES } from '../src/experience/orb/vendor/constants';
import { nodePosition, NODE_ARC_ANGLES_DEG, NODE_RING_RADIUS } from '../src/experience/orb/node-layout';
import { storeEvidence, listEvidence, reverifyEvidence } from '../src/sovereign/evidence';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const RENDERER = 'src/experience/orb/vendor/CodexOrbSystem.tsx';

test('v0.1.8 nodes: exactly the four approved nodes, each opening a real panel', () => {
  assert.deepEqual(
    NVK_AGENT_NODES.map((n) => n.id),
    ['agents', 'evidence', 'diagnostics', 'system'],
  );
  assert.deepEqual(
    NVK_AGENT_NODES.map((n) => n.panel),
    ['agents', 'evidence', 'diagnostics', 'settings'],
  );
  assert.deepEqual(
    NVK_AGENT_NODES.map((n) => n.title),
    ['Agents', 'Evidence', 'Diagnostics', 'System'],
  );
  // No legacy copy survives in a node description.
  for (const node of NVK_AGENT_NODES) {
    assert.doesNotMatch(node.description, /MythoTech|Nexus|Rebirth|Lore/i);
    assert.ok(node.description.trim().length > 0);
  }
  // The host maps each node to its panel, and the app has all six tabs
  // (Chat + Visualizations stay in the nav; they are not orb nodes).
  const host = read('src/experience/orb/OrbHost.tsx');
  assert.ok(host.includes("export type OrbPanel = 'chat' | 'visualizers' | 'diagnostics' | 'settings' | 'agents' | 'evidence';"));
  const app = read('src/App.tsx');
  for (const tab of ['chat', 'visualizers', 'agents', 'evidence', 'diagnostics', 'settings']) {
    assert.ok(app.includes(`id: '${tab}'`), `nav tab ${tab} missing`);
  }
  assert.ok(app.includes("{panel === 'evidence' && <EvidencePanel />}"));
});

test('v0.1.8 nodes: the legacy gateway identifiers are gone from src/', () => {
  // ProjectViewer is deleted; nothing imports it, nothing defines the
  // old gateway list or its type, and no legacy project list survives.
  // Comments that document the removal are not code — strip them
  // before scanning so the history note cannot trip the test.
  assert.equal(existsSync(join(root, 'src/experience/orb/vendor/ProjectViewer.tsx')), false);
  const hits: string[] = [];
  const stripComments = (text: string) =>
    text
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && t !== '*/';
      })
      .join('\n');
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const text = stripComments(readFileSync(full, 'utf8'));
        for (const name of ['NEXUS_GATEWAYS', 'NexusGateway', 'ProjectViewer', 'setSelectedGateway', 'selectedGateway']) {
          if (text.includes(name)) hits.push(`${full}: ${name}`);
        }
      }
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(hits, [], `legacy gateway identifiers found in src/: ${hits.join('; ')}`);
  // No project list survives in the node data.
  assert.equal(read('src/experience/orb/vendor/constants.ts').includes('projects:'), false);
});

test('v0.1.8 nodes: all four labels visible at once — fixed front arc, oscillation inside it (v0.1.9)', () => {
  // Pure geometry: every node sits on the camera side of the core.
  assert.deepEqual(NODE_ARC_ANGLES_DEG, [35, 70, 110, 145]);
  const positions = [0, 1, 2, 3].map((i) => nodePosition(i, NODE_RING_RADIUS));
  for (const p of positions) {
    assert.ok(p.z > 0, `node must be in front of the core (z > 0), got z=${p.z}`);
    assert.equal(p.y, 0);
  }
  const xs = positions.map((p) => p.x);
  assert.ok(Math.min(...xs) < -5 && Math.max(...xs) > 5, 'nodes must spread across the view');
  // The ring never REVOLVES: v0.1.9 lets it oscillate ±20° inside the
  // front arc (nodeOrbitOffset), but the rotation must be an absolute
  // assignment from the scene clock — an increment (+=) would
  // accumulate into a revolution and hide a label behind the sphere.
  const src = read(RENDERER);
  assert.equal(src.includes('gatewayGroupRef.current.rotation.y +='), false, 'ring rotation must never accumulate');
  assert.ok(src.includes('gatewayGroupRef.current.rotation.y = nodeOrbitOffset(elapsedTime);'), 'ring must take the absolute orbit offset');
  assert.ok(src.includes('nodePosition(i, gatewayRadius)'), 'nodes must be placed from node-layout');
  // Far-side fade is kept (it still applies if the user orbits the
  // camera around), but it can never trigger in the default view.
  assert.ok(src.includes('const targetOpacity = facing > -0.25 ? 0.8 : 0;'));
});

test('v0.1.8 nodes: empty-black panel reframed — tilted camera, shorter panel', () => {
  const src = read(RENDERER);
  // Tilted start (0, 10, 22) instead of flat (0, 0, 25): the galaxy
  // disk and ring read as an ellipse and fill the frame.
  assert.ok(src.includes('camera.position.set(0, 10, 22)'), 'camera must start tilted');
  assert.equal(src.includes('camera.position.z = 25;'), false, 'flat camera start must be gone');
  assert.ok(src.includes("gsap.to(cameraRef.current.position, { x: 0, y: 10, z: 22,"), 'reset must return to the tilted view');
  // Shorter desktop panel (520 → 420) so the hero prompts fit the
  // first screen at 1920x1000 — and the tilted scene still fills it.
  const css = read('src/index.css');
  assert.ok(css.includes('height: 420px;'), 'desktop orb height must be 420px');
  assert.equal(css.includes('height: 520px;'), false, '520px desktop orb height must be gone');
});

test('v0.1.8 evidence: the panel reads the real store, with an honest empty state', async () => {
  // Store → list → re-verify round trip through the real store.
  const record = await storeEvidence({
    input: 'What is 2+2?',
    answer: 'The sum of 2 and 2 is equal to four.',
    modelId: 'Xenova/Qwen1.5-0.5B-Chat',
    route: 'local',
    demoMode: false,
    intent: 'test',
  });
  assert.ok(record.id.startsWith('ev-'));
  assert.ok(record.sha256.length >= 32, 'record must carry a hash');
  const all = await listEvidence();
  const found = all.find((r) => r.id === record.id);
  assert.ok(found, 'stored record must be listable');
  assert.equal(found?.answer, 'The sum of 2 and 2 is equal to four.');
  const check = await reverifyEvidence(record.id);
  assert.equal(check.found, true);
  assert.equal(check.pass, true, 're-verify must pass for an unaltered record');
  // The panel itself: reads the store, verifies, and says so honestly
  // when there is nothing to show. Its entries state starts empty and
  // is filled ONLY by listEvidence() — no hardcoded sample records.
  const panel = read('src/experience/chat/EvidencePanel.tsx');
  assert.ok(panel.includes('listEvidence'));
  assert.ok(panel.includes('reverifyEvidence'));
  assert.ok(panel.includes('No evidence recorded yet'));
  assert.ok(panel.includes('useState<EvidenceRecord[] | null>(null)'));
  assert.equal(panel.includes('const entries = ['), false, 'panel must not hardcode sample entries');
});
