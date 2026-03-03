---
phase: 1
slug: testing-correctness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | WebdriverIO + Mocha (E2E) |
| **Config file** | `e2e/wdio.conf.ts` |
| **Quick run command** | `cd e2e && npx wdio run ./wdio.conf.ts --mochaOpts.grep "TEST_NAME"` |
| **Full suite command** | `cd e2e && npx wdio run ./wdio.conf.ts` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for relevant test
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | TEST-01 | e2e | `--mochaOpts.grep "accept-all applies new content"` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | TEST-02 | e2e | `--mochaOpts.grep "per-chunk accept reject"` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | TEST-03 | e2e | `--mochaOpts.grep "open diff tab when.*modified externally"` | ✅ | ⬜ pending |
| TBD | 01 | 1 | TEST-04 | e2e | `--mochaOpts.grep "expand collapsed unchanged"` | ✅ | ⬜ pending |
| TBD | 01 | 1 | TEST-05 | e2e | `--mochaOpts.grep "accumulate sequential edits"` | ✅ | ⬜ pending |
| TBD | 01 | 1 | TEST-06 | commit | N/A (commit task) | N/A | ⬜ pending |
| TBD | 01 | 1 | TEST-07 | e2e | `--mochaOpts.grep "reject.*restores original"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers most requirements
- New test stubs needed for TEST-01 (content verification) and TEST-02 (per-chunk revert)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full workflow walkthrough | ALL | Verification gate — user deploys to vault and manually confirms | Deploy plugin, make external changes, verify accept/reject behavior |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
