# Requirements: Obsidian Diff Viewer

**Defined:** 2026-03-03
**Core Value:** When external tools modify vault files, the user can immediately see exactly what changed and selectively accept or reject each change — without leaving Obsidian.

## v1 Requirements

### Testing & Correctness

- [ ] **TEST-01**: E2e tests confirm accept-all applies new content correctly (not reversed)
- [ ] **TEST-02**: E2e tests confirm per-chunk accept and per-chunk reject work via revert controls
- [ ] **TEST-03**: E2e tests confirm external change detection opens diff view automatically
- [ ] **TEST-04**: E2e tests confirm fold/expand of unchanged regions syncs across both sides of the diff
- [ ] **TEST-05**: E2e tests confirm accumulated diffs (multiple external edits to same file) resolve correctly
- [ ] **TEST-06**: Commit the DiffView.ts side-swap fix with passing tests
- [ ] **TEST-07**: E2e tests confirm reject-all restores original content correctly

### Persistence

- [ ] **PERS-01**: Pending diffs survive Obsidian reload (stored via saveData/loadData in data.json)
- [ ] **PERS-02**: Stale diffs are discarded on restore (file deleted or content no longer matches)
- [ ] **PERS-03**: Accept/reject re-reads file before writing to detect changes since diff was generated

### Settings

- [ ] **SETT-01**: Setting to toggle internal+external vs external-only change tracking
- [ ] **SETT-02**: Setting for folder/file exclusion patterns (glob-style)
- [ ] **SETT-03**: Setting for fold context margin and minimum unchanged region size

### Performance

- [ ] **PERF-01**: Incremental re-render — adding/removing one file doesn't destroy other MergeViews
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
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| TEST-06 | — | Pending |
| TEST-07 | — | Pending |
| PERS-01 | — | Pending |
| PERS-02 | — | Pending |
| PERS-03 | — | Pending |
| SETT-01 | — | Pending |
| SETT-02 | — | Pending |
| SETT-03 | — | Pending |
| PERF-01 | — | Pending |
| PERF-02 | — | Pending |
| CLEN-01 | — | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16 ⚠️

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after initial definition*
