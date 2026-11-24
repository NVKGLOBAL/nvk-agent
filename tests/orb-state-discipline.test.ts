/**
 * NVK Agent — orb state-discipline tests (v0.1.5, Phase A).
 *
 * Run: npm test
 *
 * Phase A (orb re-engineering, discovery §7): ONE orb-state vocabulary
 * (the Agent's 8 states), no timer-driven transitions, no scripted
 * sequences, no canned answers. The OS repo's dishonest wiring — 600 ms
 * setTimeout step completion, a dead scripted state sequence, a canned
 * keyword fallback, a 7-state orb-state type and an 11-state event
 * vocabulary — must never be introduced here. These tests prove:
 *
 * 1. A scripted 2+2 run moves the orb through listening → thinking →
 *    planning → executing → verifying → complete, with EVERY transition
 *    citing a real pipeline stage event (stage + timestamp + elapsed).
 * 2. A denied restricted action moves the orb to 'blocked' — from the
 *    real permission event, not a timer.
 * 3. The visual input (color / entropy / pulse) covers exactly the 8
 *    states, with the OS-repo-derived values (thinking entropy 0.4 +
 *    2.2x pulse; executing entropy 0.25; blocked red + entropy 0.6).
 * 4. No timer exists on the orb-state path (OrbHost / orb-state /
 *    pipeline source contains no setTimeout / setInterval).
 * 5. No canned/scripted state machinery exists anywhere in the Agent's
 *    source — the OS repo's identifiers are absent from src/.
 * 6. The chat path never fabricates an answer: in demo mode (no model
 *    loaded) 2+2 is NOT answered — it says so, honestly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runPipeline,
  subscribeToStages,
  type StageEvent,
} from '../src/intelligence/pipeline';
import {
  ORB_STATES,
  orbStateForStageEvent,
  orbVisualForState,
  type OrbActivityState,
} from '../src/experience/orb/orb-state';
import { checkMilestone10Answer } from '../src/intelligence/inference';
import { settingsStore } from '../src/intelligence/settings';

const EXPECTED_RUN_SEQUENCE: OrbActivityState[] = [
  'listening',
  'thinking',
  'planning',
  'executing',
  'verifying',
  'complete',
];

test('orb states: scripted 2+2 run moves the orb listening → thinking → planning → executing → verifying → complete, each citing a real stage event', async () => {
  // Demo-mode precondition: the free gateway is ON by default in the
  // browser, which would answer via the live gateway instead of demo
  // mode. These tests assert demo mode, so they turn all cloud off.
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const seen: { state: OrbActivityState; event: StageEvent }[] = [];
  const unsub = subscribeToStages((event) => {
    seen.push({ state: orbStateForStageEvent(event), event });
  });
  try {
    const result = await runPipeline('What is 2+2? Answer in one word.');
    assert.equal(result.demoMode, true, 'no model is loaded in the test process');
  } finally {
    unsub();
  }

  assert.ok(seen.length >= 11, `expected all 11 stage events, got ${seen.length}`);
  // Every transition cites a real event: a stage name, a timestamp, an elapsed time.
  for (const { state, event } of seen) {
    assert.ok(typeof event.stage === 'string' && event.stage.length > 0, 'event has a stage');
    assert.ok(typeof event.at === 'number' && event.at > 0, 'event has a timestamp');
    assert.ok(typeof event.elapsedMs === 'number' && event.elapsedMs >= 0, 'event has elapsedMs');
    assert.ok((ORB_STATES as readonly string[]).includes(state), `unknown orb state ${state}`);
  }
  // Collapse consecutive duplicates (several stages map to one state) and
  // assert the orb walked the full sequence, in order, with no gaps.
  const distinct: OrbActivityState[] = [];
  for (const { state } of seen) {
    if (distinct[distinct.length - 1] !== state) distinct.push(state);
  }
  assert.deepEqual(
    distinct,
    EXPECTED_RUN_SEQUENCE,
    `orb sequence was ${distinct.join(' → ')}`,
  );
});

test('orb states: a denied restricted action moves the orb to blocked, from the real permission event', async () => {
  const events: StageEvent[] = [];
  const unsub = subscribeToStages((event) => events.push(event));
  let result;
  try {
    result = await runPipeline('Post this to X', {
      requestedAction: {
        category: 'publishing',
        action: 'post to X',
        detail: 'test post',
      },
    });
  } finally {
    unsub();
  }
  assert.equal(result.blocked, true, 'publishing without approval must block');
  assert.ok(result.blockedReason, 'a blocked run names its reason');

  const permission = events.find((e) => e.stage === 'permission');
  assert.ok(permission, 'permission stage event was emitted');
  assert.match(permission.note ?? '', /^DENIED/, 'permission event carries the DENIED note');
  assert.equal(
    orbStateForStageEvent(permission),
    'blocked',
    'the DENIED permission event maps the orb to blocked',
  );
});

test('orb visual input: exactly the 8 states, OS-repo-derived values, bounded ranges', () => {
  assert.deepEqual([...ORB_STATES], [
    'idle',
    'listening',
    'thinking',
    'planning',
    'executing',
    'verifying',
    'complete',
    'blocked',
  ]);
  const colors = new Set<string>();
  for (const state of ORB_STATES) {
    const v = orbVisualForState(state);
    assert.match(v.color, /^#[0-9a-f]{6}$/, `${state} color is a hex color`);
    assert.ok(!colors.has(v.color), `${state} color ${v.color} is not distinct`);
    colors.add(v.color);
    assert.ok(v.entropy >= 0 && v.entropy <= 1, `${state} entropy ${v.entropy} in [0,1]`);
    assert.ok(v.pulse > 0, `${state} pulse ${v.pulse} is positive`);
  }
  // Values taken from the OS repo's orb animation loop (discovery §2).
  assert.deepEqual(orbVisualForState('thinking'), { color: '#a855f7', entropy: 0.4, pulse: 2.2 });
  assert.equal(orbVisualForState('executing').entropy, 0.25);
  assert.deepEqual(orbVisualForState('blocked'), { color: '#ff5a5a', entropy: 0.6, pulse: 0.8 });
  // No "discovery" gold: no pipeline event produces it, so it is not a state.
  assert.equal((ORB_STATES as readonly string[]).includes('discovery'), false);
});

test('no timers on the orb-state path: OrbHost / orb-state / pipeline contain no setTimeout or setInterval', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  const statePath = [
    'src/experience/orb/OrbHost.tsx',
    'src/experience/orb/orb-state.ts',
    'src/intelligence/pipeline.ts',
  ];
  for (const rel of statePath) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.equal(src.includes('setTimeout'), false, `${rel} must not contain setTimeout`);
    assert.equal(src.includes('setInterval'), false, `${rel} must not contain setInterval`);
  }
});

test('no canned or scripted state machinery anywhere in the Agent source', () => {
  // The OS repo's dishonest identifiers. They must not appear in src/ —
  // not as code, not as a comment, not as a type. (The audit record lives
  // in docs/PHASE-A-STATE-DISCIPLINE.md, which this scan does not cover.)
  const FORBIDDEN = [
    'generateDeterministicFallback',
    'orbStateSequence',
    'NVKOrbState',
  ];
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, '..', 'src');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        for (const name of FORBIDDEN) {
          if (text.includes(name)) hits.push(`${full}: ${name}`);
        }
      }
    }
  };
  walk(srcRoot);
  assert.deepEqual(hits, [], `forbidden OS-repo identifiers found in src/: ${hits.join('; ')}`);
});

test('no canned answers in the chat path: demo-mode 2+2 is not answered, it says so', async () => {
  // Demo-mode precondition: the free gateway is ON by default in the
  // browser, which would answer via the live gateway instead of demo
  // mode. These tests assert demo mode, so they turn all cloud off.
  settingsStore.update({ cloudEnabled: false, providerKey: null, cloudProvider: null, freeCloudEnabled: false });
  const result = await runPipeline('What is 2+2? Answer in one word.');
  assert.equal(result.demoMode, true, 'no model is loaded in the test process');
  assert.match(result.answer, /Demo mode/, 'demo answer says it is demo mode');
  // The milestone check must FAIL in demo mode: a fabricated "4" here
  // would be a canned answer presented as intelligence.
  assert.equal(
    checkMilestone10Answer(result.answer).pass,
    false,
    `demo answer must not contain a 2+2 answer: ${JSON.stringify(result.answer)}`,
  );
});
