# Roadmap — NVK Agent

Gates, not promises. A gate is complete only when its evidence package exists
(a passing test run, a verified deploy, a recorded measurement). Nothing is
marked complete on a claim.

## G0 — Scaffold (this repo, v0.1.0)
- [x] Local inference engine (Transformers.js, no canned fallback)
- [x] 11-stage pipeline with real stage events
- [x] Capability registry + honesty tests
- [x] Permission gate (deny by default)
- [x] Diagnostics that can fail
- [x] System Settings (models, providers, cloud toggle)
- [x] Agent spawn loop (register → run → result + evidence)
- [x] Orb + visualizers live on real pipeline activity
- [x] Evidence store with re-verify
- [x] Production build passes (`tsc --noEmit` + `vite build`)
- [x] Milestone-10 passing run recorded in `docs/MILESTONE-10.md` (Qwen1.5-0.5B-Chat, Node; browser run still pending)

## G1 — First real answer
- [ ] Milestone-10 PASS on a real device (model, load time, answer, tok/s recorded)
- [ ] Local inference flipped OPERATIONAL in the registry with that evidence
- [ ] Chat used end-to-end in the browser (model download → 2+2 → real answer)
- [ ] First paint + bundle size measured and published

## G2 — Cloud, earned
- [ ] Owner opts in to one cloud provider with a session key; a cloud answer
      is produced and labelled as leaving the device
- [x] Outbound counter shows the real request in diagnostics (fixed 2026-11-24 — see NVK-AGENT-OUTBOUND-COUNTER-FIX-LOG-2026-11-24.md)
- [ ] Self-hosted fonts/icons/libraries replace every runtime CDN (fixes the
      last of the no-APIs claim; the diagnostic counts real requests)

## G3 — CODEXA as a product
- [ ] Stripe checkout wired for CODEXA (1 week free, then $20/month)
- [ ] Billing status visible in Settings; trial state honest
- [ ] No payment is taken before the intelligence milestone (G1) is green

## G4 — Agents that do things
- [ ] First real tool beyond chat: diagnostics + memory tools callable by the
      agent through the pipeline (permission-gated)
- [ ] First restricted action completed end-to-end with owner approval
      (e.g. a publish) — approval record + evidence on file
- [ ] Agent census shows a completed multi-step run

## G5 — Sovereignty
- [ ] Weight integrity verification from real hub metadata (no placeholder hashes)
- [ ] Decentralized identity (CosmJS) — only when a real implementation exists;
      until then it stays MISSING, not claimed
- [ ] Public release decision (repo is private until the owner flips it)
