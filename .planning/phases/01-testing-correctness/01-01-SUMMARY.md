---
phase: 01-testing-correctness
plan: 01
subsystem: testing
tags: [e2e, wdio, codemirror, merge-view, obsidian]

# Dependency graph
requires: []
provides:
  - "Committed DiffView.ts side-swap fix (A=newContent, B=oldContent)"
  - "Strengthened e2e tests with content verification for accept, reject, fold sync, accumulated diffs"
affects: [01-testing-correctness, 02-settings-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "readFileFromVault for post-action content verification in e2e tests"
    - "Per-editor scoped CSS selectors (.cm-merge-a / .cm-merge-b) for fold sync assertions"

key-files:
  created: []
  modified:
    - "src/DiffView.ts"
    - "e2e/test/specs/external-change.e2e.ts"

key-decisions:
  - "Side A/B assertions in existing tests corrected to match fixed MergeView layout (A=new, B=old)"

patterns-established:
  - "Content verification pattern: action -> pause -> readFileFromVault -> expect content"
  - "Dual-editor fold assertions: scope fold widget selectors to .cm-merge-a and .cm-merge-b separately"

requirements-completed: [TEST-01, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07]

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 1 Plan 01: Side-swap Fix and E2E Content Verification Summary

**Committed MergeView side-swap fix and strengthened 9 e2e tests with vault content verification proving accept/reject/fold/accumulate correctness**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T21:15:40Z
- **Completed:** 2026-03-03T21:18:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Committed the DiffView.ts side-swap fix: Side A (editable) now correctly receives newContent, Side B (read-only) receives oldContent
- Accept test (TEST-01) now reads vault file after accept and verifies it contains the NEW external content
- Fold sync test (TEST-04) now uses per-editor scoped selectors (.cm-merge-a/.cm-merge-b) to verify both editors expand/collapse together
- Accumulated diffs test (TEST-05) now accepts and verifies vault file contains the latest accumulated content
- Fixed side A/B assertions in two existing tests that were swapped relative to the corrected MergeView layout
- All 9 e2e tests pass green (41.8s)

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit the DiffView.ts side-swap fix** - `c2dfe01` (fix)
2. **Task 2: Strengthen existing e2e tests with content verification** - `0c8f50a` (test)

## Files Created/Modified
- `src/DiffView.ts` - Swapped MergeView sides so accept applies new content, tooltip changed to "Revert this change"
- `e2e/test/specs/external-change.e2e.ts` - Added content verification assertions, fixed side A/B expectations, scoped fold selectors per editor

## Decisions Made
- Corrected side A/B assertions in tests 7 and 8 to match the new MergeView layout (A=newContent, B=oldContent) -- these were written before the side-swap fix and would have failed without correction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed swapped side A/B assertions in existing tests**
- **Found during:** Task 2 (Strengthen e2e tests)
- **Issue:** Tests 7 and 8 had assertions expecting A=oldContent, B=newContent, which was correct before the side-swap fix but incorrect after
- **Fix:** Swapped the expected values so A=newContent (external/latest), B=oldContent (original/baseline)
- **Files modified:** e2e/test/specs/external-change.e2e.ts
- **Verification:** All 9 e2e tests pass
- **Committed in:** 0c8f50a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary correction to align assertions with the side-swap fix from Task 1. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Side-swap fix is committed and verified by content assertions
- All 9 e2e tests pass, providing a solid baseline for Plan 02 (e2e reliability improvements)
- TEST-07 (reject restores original) was already strong in existing tests, confirmed passing

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 01-testing-correctness*
*Completed: 2026-03-03*
