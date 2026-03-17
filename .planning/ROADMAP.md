# Roadmap: Obsidian Diff Viewer

## Overview

This milestone hardens the existing diff viewer plugin into a reliable, configurable tool. The journey starts by verifying and committing the current functionality (testing), then replaces the unreliable detection system with CM6 transaction-based detection and adds persistence (the biggest missing feature), then makes the plugin configurable (settings), refactors rendering to be incremental (performance), and finishes by stripping dev-only commands for a clean production build.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Testing & Correctness** - Verify all existing functionality with e2e tests and commit the side-swap fix
- [ ] **Phase 4: Persistence & Detection** - Replace FileWatcher with CM6 transaction-based detection and persist diffs across restarts
- [ ] **Phase 2: Settings & Snapshot Hardening** - Add configurable settings for tracking mode, file exclusions, fold context, and fix initial snapshot staleness
- [ ] **Phase 3: Incremental Rendering** - Replace full-rebuild rendering with per-file add/remove so MergeViews survive unrelated changes
- [ ] **Phase 5: Production Cleanup** - Remove test simulation commands from production builds

## Phase Details

### Phase 1: Testing & Correctness
**Goal**: All existing diff viewer functionality is verified by passing e2e tests, and the side-swap fix is committed
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07
**Success Criteria** (what must be TRUE):
  1. User clicks "Accept All" on a diff and the file contains the new (external) content, not the old content
  2. User clicks individual chunk accept/reject buttons and only the targeted chunk is applied or reverted
  3. An external file change automatically opens the diff view without user intervention
  4. User expands a folded unchanged region and both sides of the diff expand in sync
  5. Multiple sequential external edits to the same file accumulate in a single diff that resolves correctly
**Verification Gate**: Manual user verification after this phase -- confirm all existing functionality works as expected before proceeding
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md -- Commit side-swap fix and strengthen existing e2e tests with content verification
- [ ] 01-02-PLAN.md -- Add per-chunk revert test and manual verification gate

### Phase 4: Persistence & Detection
**Goal**: External change detection is reliable (CM6 transaction-based) and pending diffs survive Obsidian restarts with staleness validation and write-time safety checks
**Depends on**: Phase 1
**Requirements**: PERS-01, PERS-02, PERS-03, DET-01, DET-02
**Success Criteria** (what must be TRUE):
  1. User types in an editor and no false external change detection occurs
  2. An external file modification (fs.writeFile or external tool) is detected and opens the diff view
  3. User closes and reopens Obsidian and all pending diffs reappear in the diff view with correct content
  4. If a file was deleted or its content reverted to match the original snapshot while Obsidian was closed, the stale diff is silently discarded on reload
  5. When the user clicks accept/reject, the plugin re-reads the file first and warns if the file has changed since the diff was generated (no silent data loss)
  6. FileWatcher.ts is deleted and debounce-based detection is removed
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md -- Persistence layer with save/restore and conflict detection
- [ ] 04-02-PLAN.md -- CM6 transaction-based detection replacing FileWatcher
- [ ] 04-03-PLAN.md -- E2E tests for persistence and detection

### Phase 2: Settings & Snapshot Hardening
**Goal**: Users can configure the plugin's tracking behavior, file scope, and fold appearance, and initial snapshots are accurate
**Depends on**: Phase 4
**Requirements**: SETT-01, SETT-02, SETT-03, PERF-02
**Success Criteria** (what must be TRUE):
  1. User can switch between internal+external and external-only change tracking in settings, and the plugin respects the choice immediately
  2. User can specify folder/file exclusion patterns and excluded files no longer trigger diff views
  3. User can adjust fold context margin and minimum unchanged region size, and the diff view reflects the new values
  4. Plugin loads with accurate file snapshots (no stale content from cache) even immediately after external edits
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Incremental Rendering
**Goal**: Adding or removing a single file's diff does not destroy or rebuild other files' MergeViews
**Depends on**: Phase 2
**Requirements**: PERF-01
**Success Criteria** (what must be TRUE):
  1. When a new external change arrives, only the new file's diff section is added to the view -- existing sections retain their scroll position and fold state
  2. When a user accepts/rejects all changes for one file, only that file's section is removed -- other sections are unaffected
**Plans**: TBD

Plans:
- [ ] 03-01: TBD

### Phase 5: Production Cleanup
**Goal**: The shipped plugin contains no development/testing commands or artifacts
**Depends on**: Phase 3 (was Phase 4)
**Requirements**: CLEN-01
**Success Criteria** (what must be TRUE):
  1. The command palette contains no "simulate" or "test" commands from this plugin
  2. The built main.js does not contain test simulation code paths
**Plans**: TBD

Plans:
- [ ] 05-01: TBD

## Progress

**Execution Order:**
Phases execute in this order: 1 -> 4 -> 2 -> 3 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Testing & Correctness | 0/2 | Planning complete | - |
| 4. Persistence & Detection | 0/3 | Planning complete | - |
| 2. Settings & Snapshot Hardening | 0/? | Not started | - |
| 3. Incremental Rendering | 0/? | Not started | - |
| 5. Production Cleanup | 0/? | Not started | - |
