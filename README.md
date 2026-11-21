# NVK Agent — sovereign intelligence, built to real

**NVK's own agent. Not a clone of Muse or of Nina.**

That needs saying plainly: Muse's weights and code are not available to copy,
and this repo does not pretend otherwise. What this repo *is*: an agent built
from NVK's own code and architecture — CODEXA's real inference path as the
starting point, improved per the CODEXA fix list and the Sovereign Unification
Directive — with the Nexus orb and visualizers as its face. The visualizations
are the representation of the AI and the user: the next generation beyond Muse
and other AIs, where the intelligence is something you see and touch, not a
chat box that performs answers.

## What works today (v0.1.0)

- **Local inference, real.** Transformers.js in-browser inference. Default
  model `Xenova/Qwen1.5-0.5B-Chat` (~350 MB, CPU/WASM, no GPU). Loads real
  weights from the Hugging Face hub with real download progress and measured
  tokens/s. **No canned fallback anywhere** — if no model is loaded, chat says
  so (demo mode) and refuses to fake a reply. That is the fix for CODEXA's
  2+2 failure, enforced by a test.
- **Milestone-10 test.** `npm run test:milestone-10` loads the model and asks
  *"What is 2+2? Answer in one word."* PASS requires the answer **"4"**. See
  `docs/MILESTONE-10.md` for the latest run evidence.
- **Agent pipeline (11 stages).** input → intent → context → reasoning →
  planning → capability discovery → permission check → execution →
  verification → evidence storage → human-readable result. Every stage emits
  a timed event; the orb subscribes to those events and nothing else.
- **Capability registry.** Every capability classified OPERATIONAL / PARTIAL /
  DISCONNECTED / SIMULATED / BROKEN / MISSING / BLOCKED with evidence. See
  `CAPABILITY-REGISTRY.md`. Tests assert no OPERATIONAL entry lacks evidence.
- **Permission gate.** Financial, payment, publishing, destructive, and
  external-account actions require explicit owner approval, one action per
  approval. Default is deny.
- **Diagnostics that can fail.** Model state, hardware adapter, counted
  outbound requests (this session), storage, registry self-check — each
  reported pass / fail / not-wired with measured detail.
- **System Settings (built, not referenced).** Model management, cloud toggle
  (OFF by default), provider keys session-only by default.
- **Agent spawn (built, not a form).** Spawned agents register, run the
  pipeline, and report a result with evidence.
- **Nexus orb + visualizers, live.** The vendored `nvknexusorb` orb system
  (shader orb, gateway nodes, particle galaxy, portal transitions) and the
  CODEXA resonance visualizer + knowledge graph, all driven by real pipeline
  activity. See `docs/VENDOR-NOTES.md`.
- **Evidence store.** Every result is hashed and stored; "Re-verify proof"
  recomputes the hash and reports pass/fail.

## What is scaffold (honest)

- **Cloud providers (Gemini / OpenAI):** BLOCKED — no key configured, cloud
  OFF by default. The fetch code is real; it needs owner opt-in + a key.
- **Payments / checkout:** MISSING. CODEXA pricing is decided (1 week free,
  then $20/month) but no payment provider is wired. No checkout is shown.
- **Wallet / chain / explorer:** MISSING. No such code exists in any NVK repo.
- **Publishing:** BLOCKED — no destination wired, and it needs explicit
  authorization per action.
- **Weight integrity hashes:** UNVERIFIED — no SHA-256 is claimed for any
  model until hub metadata is read. The registry says so.
- **Model validation on a device:** DISCONNECTED until milestone-10 passes on
  that device (see `docs/MILESTONE-10.md`).

## Architecture — three layers

```
src/
  experience/     # Everything humans see: orb, visualizers, chat, settings
  intelligence/   # Models, memory, pipeline, tools, permissions, diagnostics
  sovereign/      # Evidence store, local identity (no external claims)
tests/            # Milestone-10 runner + honesty tests
docs/             # Milestone evidence, vendor notes, roadmap
```

## Run it

```bash
npm install
npm run dev        # Vite dev server
npm run build      # typecheck + production build
npm test           # honesty tests (registry, engine, permissions)
npm run test:milestone-10   # the 2+2 test — downloads ~350 MB on first run
```

## Rules this repo lives by

- No Capability Theater: never claim what has not been verified.
- Sacred geometry: Flower of Life / Buga sphere only. Never a six-pointed
  star / hexagram, in art, code, or copy.
- No secrets, ever: no `.env`, no keys, no tokens in this repo.
- Local first: nothing leaves the device unless the owner explicitly enables
  cloud — and then it says so plainly.
- The orb shows only real pipeline states. It never pretends to think.

## Roadmap

See `docs/ROADMAP.md`. Gates, not promises — each gate needs an evidence
package before it is marked complete.
