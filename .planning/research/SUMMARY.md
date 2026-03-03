# Project Research Summary

**Project:** obsidian-diff-viewer
**Domain:** Obsidian plugin — external change detection, diff resolution, persistence
**Researched:** 2026-03-03
**Confidence:** HIGH

## Executive Summary

The obsidian-diff-viewer plugin already has a solid working foundation: CodeMirror MergeView with patience diff, per-chunk and per-file accept/reject, real-time external change detection, and a custom fold system. The next milestone adds three things that the current implementation critically lacks: persistence of pending diffs across Obsidian reloads, configurable settings (file exclusions, fold context, tracking mode), and incremental re-rendering that doesn't destroy all MergeViews on every change. Research confirms all three are achievable entirely with existing dependencies — no new npm packages are needed.

The recommended approach is to implement these in a fixed dependency order: settings first (because every subsequent component reads them), incremental rendering second (because diff restoration would trigger full rebuilds without it), and persistence last (because it ties both together). All persistence must go through `Plugin.saveData()`/`loadData()` into `data.json` — not `workspace.json`, not `vault.adapter.write()`. The data schema must separate settings and pendingDiffs into explicit namespaces to avoid key collisions. Callbacks must be recreated on restore, not serialized.

The main risks are concentrated in the persistence phase. The highest-severity pitfalls — `setState` ordering, `workspace.json` bloat, `vault.modify` race conditions, and unreliable quit events — all have clear, documented prevention strategies. The current full-rebuild render pattern is a medium-severity risk that causes visible flicker and state loss and must be replaced before persistence is wired in. The `cachedRead` staleness bug in initial snapshots is already identified and has a one-line fix (`vault.read()` instead of `vault.cachedRead()` in `FileWatcher.start()`).

---

## Key Findings

### Recommended Stack

No new dependencies are required. Every capability needed for this milestone is already present in the installed `obsidian` and `@codemirror/merge` packages. The Obsidian API provides `Plugin.loadData()`/`saveData()` for persistence (writes to `.obsidian/plugins/<id>/data.json`), `Setting.addDropdown()`/`addSlider()`/`addTextArea()` for expanded settings UI, and `vault.read()` for accurate initial snapshots. The `@codemirror/merge` package (v6.12.0) provides `MergeView.reconfigure()` for updating config without teardown, and exposes `EditorView` instances (`mv.a`, `mv.b`) for dispatching fold range updates.

**Core technologies:**
- `Plugin.saveData()`/`loadData()`: diff persistence — standard Obsidian mechanism, handles data.json automatically, compatible with Obsidian Sync
- `Plugin.onExternalSettingsChange()`: settings sync — fires when data.json is modified by another device or external program
- `MergeView.reconfigure()`: config updates — preserves scroll/fold state when settings change; available since @codemirror/merge 0.1.3
- `Setting.addSlider()`/`addDropdown()`/`addTextArea()`: settings UI — built-in components that prevent invalid input without custom parsing
- `vault.read()` (not `cachedRead()`): initial snapshots — forces disk read, avoids stale content on plugin load

### Expected Features

The feature set divides cleanly into what's done, what's missing but essential, and what's a quality-of-life improvement.

**Must have (table stakes):**
- Diff persistence across reload — single most critical gap; users cannot close Obsidian with pending changes without losing them
- File exclusion patterns — without this, high-activity vaults (templates, auto-generated content) flood the diff view
- Correct old/new side orientation — active fix in uncommitted DiffView.ts; must land before persistence so stored content is correct

**Should have (differentiators that solidify the UX):**
- Incremental re-render — eliminates full-DOM-rebuild flicker; stabilizes MergeView references for downstream features
- Internal/external tracking mode — low effort toggle that expands the plugin's audience
- Fold context customization (margin, minSize) — values already parameterized in `computeUnchangedRanges`; just needs settings wiring
- Status bar pending diff count — trivial `addStatusBarItem()` implementation, meaningful polish

**Defer (v2+):**
- Keyboard navigation between chunks — quality of life, blocked on stable MergeView references anyway
- Diff history / past diff log — Edit History plugin covers this; out of scope
- Inline/single-column diff mode — doubles UI complexity; Version History Diff already serves that audience
- Git integration — Obsidian Git covers this; remain git-agnostic

### Architecture Approach

The recommended architecture adds two new components (DiffStore for persistence, expanded SettingsManager) while refactoring DiffView from full-rebuild to section-keyed incremental updates. The existing pipeline (Vault Event → FileWatcher → ExternalDiffPlugin → DiffView → MergeView) stays intact. DiffStore sits alongside DiffView as a peer, both managed by ExternalDiffPlugin. On plugin load, ExternalDiffPlugin calls DiffStore.load(), validates each persisted diff against current vault state (staleness check), recreates callbacks via `makeDiffCallbacks()`, and uses incremental `addFile()` to populate the view without a full rebuild.

**Major components:**
1. `DiffStore` (new — `diffStore.ts`) — serializes/deserializes pending diffs to `data.json`; debounces saves; handles staleness validation on restore
2. `DiffView` (refactored) — replaces `render()` with `appendSection()` and targeted `removeFile()`; FileSection gains an `element` reference for DOM targeting
3. `SettingsManager` (expanded — `settings.ts`) — adds `excludePatterns`, `watchMode`, `foldMargin`, `foldMinSize`, `autoOpen`; propagates changes to FileWatcher and DiffView via explicit update methods

### Critical Pitfalls

1. **setState ordering (Pitfall 1)** — `setState()` is called AFTER `onOpen()`, so rendering persisted diffs in `onOpen()` produces a blank view on reload. Use two-phase init: `onOpen()` sets up the container, `setState()` populates it.
2. **workspace.json bloat (Pitfall 2)** — Storing full file content in view state via `getState()` bloats `workspace.json`, slowing startup and sync. Store all content in `data.json` via `saveData()`; put only lightweight references (paths, timestamps) in `getState()`.
3. **Full MergeView destroy/recreate (Pitfall 3)** — Current `render()` destroys all MergeView instances on every change. This causes scroll/fold state loss and flicker. Cache MergeViews by path; only destroy/create the affected section.
4. **vault.modify race condition (Pitfall 4)** — Concurrent external edits during accept/reject cause silent data loss. Re-read the file with `vault.read()` before writing; show a re-diff prompt if content changed.
5. **saveData concurrent writes (Pitfall 6)** — Rapid external changes trigger concurrent saves that race and drop updates. Debounce all saves to 500ms; treat in-memory state as source of truth, save periodically.

Additional high-confidence pitfalls to track:
- **data.json key namespace collision (Pitfall 12):** Use `{ settings: {...}, pendingDiffs: {...} }` structure — never mix settings and file-path keys at the same level.
- **cachedRead staleness (Pitfall 5):** Use `vault.read()` for initial snapshots in `FileWatcher.start()`.
- **Quit event unreliability (Pitfall 13):** Do not rely on quit events for saves; save on state transitions (diff added, diff resolved).

---

## Implications for Roadmap

Based on the dependency graph in ARCHITECTURE.md and the feature priorities in FEATURES.md, three phases are the right structure. Phase ordering is dictated by hard dependencies, not preference.

### Phase 1: Settings Expansion + Snapshot Hardening

**Rationale:** Every subsequent component reads settings. FileWatcher filtering depends on `excludePatterns`. DiffView fold config depends on `foldMargin`/`foldMinSize`. DiffStore schema wraps settings. Building settings first means phases 2 and 3 can read from a stable, tested interface. The snapshot hardening (`vault.read()` fix and `cachedRead` → `read()` swap) belongs here because it's a one-line correctness fix with no dependencies.

**Delivers:**
- Expanded `ExternalDiffSettings` interface with `excludePatterns`, `watchMode`, `foldMargin`, `foldMinSize`, `autoOpen`
- Settings UI: dropdown for `watchMode`, text area for `excludePatterns`, sliders for fold config, toggle for `autoOpen`
- FileWatcher filters excluded paths at snapshot time AND on modify events
- `vault.read()` for initial snapshots (staleness fix)
- `settingsVersion` field to handle future migrations

**Addresses:** File exclusions (table stakes), fold customization (differentiator), internal/external tracking mode (differentiator)
**Avoids:** Pitfall 5 (cachedRead staleness), Pitfall 7 (settings schema migration), Pitfall 8 (snapshot memory growth)

### Phase 2: Incremental DiffView Rendering

**Rationale:** The current full-rebuild render pattern is both a UX bug and a prerequisite for persistence. If DiffStore restore calls `addFile()` for 5 pending diffs and each `addFile()` triggers a full rebuild, the user sees 5 flickers and all scroll/fold state is lost. Incremental rendering must be stable before DiffStore is layered on top.

**Delivers:**
- Replace `render()` with `appendSection(path)` and targeted `removeFile(path)`
- `FileSection` gains `element: HTMLElement | null` for direct DOM removal
- MergeView lifecycle scoped to individual sections (only create/destroy the affected section)
- Fold config sourced from settings (not hardcoded)
- Fold widgets no longer hold references to destroyed editors (Pitfall 10 resolved as a consequence)

**Addresses:** Incremental re-render (differentiator)
**Avoids:** Pitfall 3 (full rebuild), Pitfall 10 (stale fold widget refs)

### Phase 3: Diff Persistence (DiffStore)

**Rationale:** Persistence is the single most important missing feature, but it correctly comes last because it depends on both settings (data schema wraps settings) and incremental rendering (restore uses `addFile()` without flicker). The complexity is in restore correctness — staleness validation, callback recreation, and two-phase init ordering.

**Delivers:**
- `DiffStore` class: `save()`, `load()`, `scheduleSave()` with 500ms debounce
- `PluginData` schema: `{ settings: ExternalDiffSettings, pendingDiffs: PersistedDiff[] }`
- Staleness validation on restore: discard diffs if file reverted; update `newContent` if file changed again
- Two-phase init: `onOpen()` sets up container, `setState()` (or `onload` after `FileWatcher.start()`) populates diffs
- `onExternalSettingsChange()` hook for Obsidian Sync scenarios
- Status bar pending diff count (trivial addition here since persistence makes the count reliable)
- `vault.modify` guard: re-read before write, prompt if content changed

**Addresses:** Diff persistence (critical gap), status bar indicator (differentiator)
**Avoids:** Pitfall 1 (setState ordering), Pitfall 2 (workspace.json bloat), Pitfall 4 (vault.modify race), Pitfall 6 (saveData races), Pitfall 12 (key collision), Pitfall 13 (quit event unreliability)

### Phase Ordering Rationale

- Phase 1 before Phase 2: FileWatcher exclusions and fold settings are read by DiffView; settings must be stable before rendering logic references them.
- Phase 2 before Phase 3: DiffStore restore calls `addFile()` in a loop; without incremental rendering, this causes O(n) full rebuilds during plugin load.
- The orientation bug fix (old/new sides swapped) should land as a hotfix before Phase 1 since it affects the content that will be persisted.

### Research Flags

Phases with well-documented patterns (can skip `/gsd:research-phase`):
- **Phase 1 (Settings):** Standard Obsidian settings expansion. `Setting` API is fully typed in `obsidian.d.ts`. Pattern is identical to what the plugin already does for `enabled`/`debounceMs`.
- **Phase 2 (Incremental Rendering):** Standard incremental DOM management. CodeMirror MergeView API is verified from installed type definitions. No unknowns.

Phases that may benefit from targeted research during planning:
- **Phase 3 (Persistence):** The two-phase init ordering (setState vs onOpen vs onLayoutReady) has documented gotchas and may need a working spike to confirm the exact lifecycle order before committing to an implementation approach.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against installed type definitions (`obsidian.d.ts`, `@codemirror/merge/dist/index.d.ts`). No new dependencies required. |
| Features | HIGH | Competitive landscape well-researched. Feature priorities and dependencies clearly laid out. Table stakes vs. differentiators are unambiguous. |
| Architecture | HIGH | Component design is straightforward extension of existing patterns. Build order is dictated by hard code dependencies, not preference. |
| Pitfalls | HIGH | Most critical pitfalls verified against official docs or real bug reports in production plugins. Reproduction steps are documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **Restore lifecycle ordering:** The exact sequence of `onload()`, `onLayoutReady()`, `setState()`, and when DiffStore.load() should run needs a working prototype to confirm. Forum evidence is clear on the problem but less clear on the cleanest solution. Budget one spike session during Phase 3 planning.
- **Exclude pattern matching:** Research confirmed glob patterns are the ecosystem standard but did not validate a specific matching library or confirm Obsidian bundles one. The simple regex approach in ARCHITECTURE.md is sufficient for the initial implementation but may need refinement for edge cases (nested globs, case sensitivity on macOS).
- **Large vault startup performance:** The `vault.read()` switch for initial snapshots is correct but may cause noticeable startup delay on vaults with thousands of markdown files. A concurrency limit on the read loop (e.g., 10 concurrent reads) may be needed. Profile during Phase 1 implementation.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/obsidian/obsidian.d.ts` — Plugin lifecycle, saveData/loadData, vault.read/cachedRead, Setting components
- `node_modules/@codemirror/merge/dist/index.d.ts` — MergeView.reconfigure(), DiffConfig, Chunk.precise
- [Obsidian Developer Docs](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData) — Plugin persistence API
- [Obsidian cachedRead docs](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead) — Staleness behavior confirmed
- [@codemirror/merge CHANGELOG](https://github.com/codemirror/merge/blob/main/CHANGELOG.md) — Version-specific feature confirmation

### Secondary (MEDIUM confidence)
- [DeepWiki: Obsidian Plugin Development](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) — Lifecycle and persistence patterns
- [Obsidian Forum: setState ordering](https://forum.obsidian.md/t/ordering-issues-when-using-view-state/70487) — Two-phase init requirement
- [Obsidian Forum: quit event unreliability](https://forum.obsidian.md/t/persisting-my-view-state-when-closing-obsidian/105036) — MacOS quit event behavior
- [CM6 MergeView reconfigure discussion](https://discuss.codemirror.net/t/merge-view-how-to-update-configuration-without-re-instance-the-merge-view/5402) — Maintainer-confirmed reconfigure usage
- [Templater vault.modify race condition](https://github.com/SilentVoid13/Templater/issues/1629) — Race condition documentation
- [obsidian-iconize data.json corruption](https://github.com/FlorianWoelki/obsidian-iconize/issues/669) — Key namespace collision bug
- [CodeMirror Merge slow diff](https://discuss.codemirror.net/t/codemirror-merge-slow-diff/7005) — Large file freeze thresholds

### Competitive landscape (MEDIUM confidence)
- [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git) — Feature comparison
- [Version History Diff plugin](https://github.com/kometenstaub/obsidian-version-history-diff) — Side-by-side diff implementation
- [File Diff plugin](https://github.com/friebetill/obsidian-file-diff) — Manual file comparison approach
- [Edit History plugin](https://github.com/antoniotejada/obsidian-edit-history) — Persistence patterns for edit archives

---

*Research completed: 2026-03-03*
*Ready for roadmap: yes*
