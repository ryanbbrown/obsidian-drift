# Requirements: Obsidian Diff Viewer

**Defined:** 2026-03-03
**Core Value:** When external tools modify vault files, the user can immediately see exactly what changed and selectively accept or reject each change -- without leaving Obsidian.

## v1 Requirements

### Testing & Correctness

- [x] **TEST-01**: E2e tests confirm accept-all applies new content correctly (not reversed)
- [ ] **TEST-02**: E2e tests confirm per-chunk accept and per-chunk reject work via revert controls
- [x] **TEST-03**: E2e tests confirm external change detection opens diff view automatically
- [x] **TEST-04**: E2e tests confirm fold/expand of unchanged regions syncs across both sides of the diff
- [x] **TEST-05**: E2e tests confirm accumulated diffs (multiple external edits to same file) resolve correctly
- [x] **TEST-06**: Commit the DiffView.ts side-swap fix with passing tests
- [x] **TEST-07**: E2e tests confirm reject-all restores original content correctly

### Persistence

- [ ] **PERS-01**: Pending diffs survive Obsidian reload (stored via saveData/loadData in data.json)
- [ ] **PERS-02**: Stale diffs are discarded on restore (file deleted or content no longer matches)
- [ ] **PERS-03**: Accept/reject re-reads file before writing to detect changes since diff was generated

### Detection

- [ ] **DET-01**: CM6 transaction-based external change detection via `updateListener` + `userEvent` annotations, replacing debounce heuristics
- [ ] **DET-02**: Remove FileWatcher.ts, pendingExternalPaths, recentlyEditedInternally, debounceMs, and editor-change listener

### Settings

- [ ] **SETT-01**: Setting to toggle internal+external vs external-only change tracking
- [ ] **SETT-02**: Setting for folder/file exclusion patterns (glob-style)
- [ ] **SETT-03**: Setting for fold context margin and minimum unchanged region size

### Performance

- [ ] **PERF-01**: Incremental re-render -- adding/removing one file doesn't destroy other MergeViews
- [ ] **PERF-02**: Use vault.read() instead of cachedRead() for initial snapshots

### Cleanup

- [ ] **CLEN-01**: Remove test simulation commands from production builds

## v2 Requirements

### Quality of Life

- **QOL-01**: Keyboard shortcuts for navigating between diff chunks
- **QOL-02**: Notification/badge when new diffs arrive while in another tab
- **QOL-03**: Diff history / past diff log

## Out of Scope

| Feature | Reason |
|---------|--------|
| Inline diff mode (single-column) | Side-by-side is the target UX, matches VS Code |
| Mobile support | Desktop only per manifest |
| Git integration | Handled by Obsidian Git plugin |
| Merge conflict resolution | Different problem domain |
| File types beyond markdown | Defer unless requested |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Complete |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 1 | Complete |
| TEST-04 | Phase 1 | Complete |
| TEST-05 | Phase 1 | Complete |
| TEST-06 | Phase 1 | Complete |
| TEST-07 | Phase 1 | Complete |
| PERS-01 | Phase 4 | Pending |
| PERS-02 | Phase 4 | Pending |
| PERS-03 | Phase 4 | Pending |
| DET-01 | Phase 4 | Pending |
| DET-02 | Phase 4 | Pending |
| SETT-01 | Phase 2 | Pending |
| SETT-02 | Phase 2 | Pending |
| SETT-03 | Phase 2 | Pending |
| PERF-01 | Phase 3 | Pending |
| PERF-02 | Phase 2 | Pending |
| CLEN-01 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-05 after Phase 4 planning (added DET-01, DET-02)*
