# Domain Pitfalls

**Domain:** Obsidian plugin hardening -- persistence, settings, CodeMirror performance
**Researched:** 2026-03-03

## Critical Pitfalls

Mistakes that cause data loss, rewrites, or severe UX degradation.

### Pitfall 1: View State Restoration Ordering -- setState Runs After onOpen

**What goes wrong:** When implementing diff persistence via `getState()`/`setState()`, the persisted state is not available during `onOpen()`. `setState()` is called *after* `onOpen()` returns. If `onOpen()` tries to render the diff UI using state that hasn't loaded yet, the view appears empty on Obsidian restart.

**Why it happens:** Obsidian's lifecycle calls `onOpen()` first, then restores serialized state from `workspace.json` via `setState()`. This is documented but counterintuitive -- developers assume state is available at render time.

**Consequences:** Diff view opens blank after Obsidian reload. User sees "No pending changes" even though diffs were persisted. Reopening the tab or triggering a re-render may fix it, but the first impression is broken.

**Prevention:**
- Do NOT render diffs in `onOpen()`. Instead, implement `setState(state)` to trigger rendering after state is restored.
- Use a two-phase init: `onOpen()` sets up the container, `setState()` populates it with persisted diff data.
- Pass state accessors (callback functions) to child components rather than static values captured at construction time.
- Test the full cycle: open diff view, add diffs, close Obsidian, reopen, verify diffs appear.

**Detection:** Diffs disappear on Obsidian reload but work fine during a session. The "No pending changes" placeholder shows on startup.

**Phase:** Persistence phase -- this is the first thing to get right when adding persistence.

**Confidence:** HIGH -- verified via multiple Obsidian forum threads documenting this exact ordering issue.

**Sources:**
- [Ordering issues when using View State](https://forum.obsidian.md/t/ordering-issues-when-using-view-state/70487)
- [setState inconsistency discussion](https://forum.obsidian.md/t/api-the-calls-to-views-setstate-are-inconsistent-or-poorly-documented/67097)

---

### Pitfall 2: Storing Full File Content in workspace.json via getState

**What goes wrong:** The natural approach to persisting diffs is to serialize `oldContent` and `newContent` strings into the view state returned by `getState()`. This state goes into `workspace.json`. For a vault with 10+ pending diffs on large files, `workspace.json` balloons to megabytes, slowing Obsidian startup and sync.

**Why it happens:** `workspace.json` is loaded synchronously at startup and synced across devices. It's meant for lightweight view metadata (scroll position, active tab), not bulk content storage.

**Consequences:** Obsidian startup slows noticeably. Obsidian Sync chokes on oversized `workspace.json`. Other plugins' workspace state restoration is delayed.

**Prevention:**
- Store diff content in plugin's own `data.json` via `saveData()`/`loadData()`, keyed by file path.
- Only store lightweight references in `getState()` (e.g., list of file paths with pending diffs, timestamps).
- On `setState()`, look up the actual content from `data.json` or re-read files and recompute if needed.
- Set a size cap: if a single diff's content exceeds a threshold (e.g., 100KB), store a flag to re-diff on reload rather than persisting content.

**Detection:** Obsidian startup noticeably slower after accumulating pending diffs. `workspace.json` file size grows abnormally.

**Phase:** Persistence phase -- architectural decision that must be made before implementing persistence.

**Confidence:** HIGH -- this follows directly from how Obsidian handles workspace.json (loaded at startup, synced).

---

### Pitfall 3: Full MergeView Destroy/Recreate on Every Change

**What goes wrong:** The current `render()` method destroys ALL MergeView instances and rebuilds the entire DOM on any change (adding a file, removing a file, collapsing a section). This causes scroll position loss, fold state loss, and O(n) re-render cost per single-file change.

**Why it happens:** It's the simplest rendering approach -- clear everything, rebuild from scratch. Works fine for 1-3 files but degrades quickly.

**Consequences:**
- User loses scroll position and fold expand/collapse state when any file is accepted/rejected.
- With 10+ concurrent diffs, accepting one file causes a visible full-page flash as all MergeViews are destroyed and recreated.
- CodeMirror MergeView has documented issues where destroy doesn't fully clean up internal hooks/timers, causing memory leaks in long-running sessions with repeated destroy/create cycles.
- Widget `destroy()` methods were not properly called on `EditorView.destroy()` until a specific CM6 patch -- the version bundled with Obsidian may not include this fix.

**Prevention:**
- Cache MergeView instances keyed by file path. Only create new ones for new files, only destroy for removed files.
- Use the `MergeView.reconfigure()` method (available since @codemirror/merge 0.1.3, current installed version is 6.12.0) to update configuration without destroying.
- For section collapse/expand, hide/show the DOM container (`display: none`) rather than destroying the MergeView.
- When a file is removed, destroy only that section's MergeView and remove only that DOM node.

**Detection:** Visible flicker when accepting/rejecting a single diff with multiple files open. Scroll position jumps to top. Memory usage climbs over a long session.

**Phase:** Performance optimization phase -- should be addressed after persistence is stable.

**Confidence:** HIGH -- the current code clearly shows the destroy-all pattern in `render()` (lines 96-100 of DiffView.ts), and MergeView.reconfigure() is confirmed available.

**Sources:**
- [MergeView reconfigure discussion](https://discuss.codemirror.net/t/merge-view-how-to-update-configuration-without-re-instance-the-merge-view/5402)
- [EditorView.destroy widget cleanup](https://discuss.codemirror.net/t/does-editorview-destroy-call-destroy-on-widgets/7370)

---

### Pitfall 4: vault.modify Race Condition with Accept/Reject During Active External Edits

**What goes wrong:** When the user clicks "Accept" or "Reject", the plugin calls `vault.modify(file, content)`. If an external tool (e.g., Claude Code) is writing to the same file at the same moment, one write silently wins and the other is lost. The user either loses their accept/reject decision or loses the external tool's latest change.

**Why it happens:** `vault.modify()` is a blind overwrite -- it does not check whether the file has changed since the plugin last read it. There is no compare-and-swap or optimistic locking. The Templater plugin documented this exact class of race condition.

**Consequences:** Data loss. The user accepts a diff, but a concurrent external edit overwrites their decision. Or the user's accept overwrites an external edit that happened between the diff being created and the user clicking Accept.

**Prevention:**
- Before calling `vault.modify()` on accept/reject, re-read the file with `vault.read()` (not `cachedRead()`) and compare to the expected `newContent`.
- If the file has changed since the diff was created, show a warning: "File has been modified since this diff was generated. Re-diff?"
- Consider using `vault.process()` for atomic read-modify-write when available (note: `vault.process()` only accepts synchronous callbacks, which limits its use).
- Mark the file as internally edited (`markAsInternalEdit`) BEFORE calling `vault.modify()` to prevent the modify from re-triggering a diff (this is already done correctly in the current code).

**Detection:** User accepts a diff, but the file content doesn't match what they expected. Spurious new diffs appear immediately after accepting.

**Phase:** Persistence/hardening phase -- should be addressed alongside accept/reject stability.

**Confidence:** HIGH -- documented in Templater plugin issue #1629 with detailed reproduction steps.

**Sources:**
- [Templater vault.modify race condition](https://github.com/SilentVoid13/Templater/issues/1629)

---

### Pitfall 5: cachedRead Returns Stale Content for Initial Snapshots

**What goes wrong:** The FileWatcher uses `vault.cachedRead()` to take initial snapshots of all markdown files on plugin load. If files were modified externally while Obsidian was closed (or between cache refresh and plugin init), the snapshot contains stale content. When the next external change arrives, the diff is computed against the stale snapshot, showing changes that were already present before the plugin loaded.

**Why it happens:** `cachedRead()` returns Obsidian's in-memory cache, which may not reflect disk state for files modified outside Obsidian. The official docs state: "The only difference between `cachedRead()` and `read()` is when the file was modified outside of Obsidian just before the plugin reads it."

**Consequences:** False positive diffs on plugin startup. User sees a diff that includes changes from before they started their session, confusing which changes are actually new.

**Prevention:**
- Use `vault.read()` (not `cachedRead()`) for the initial snapshot pass in `FileWatcher.start()`. This forces a disk read.
- Keep using `cachedRead()` for subsequent `handleModify` calls (by then the cache is synchronized with the file system notification).
- Profile the startup cost of `vault.read()` on large vaults -- if too slow, batch reads with a small concurrency limit rather than `Promise.all` on thousands of files.

**Detection:** Spurious diffs appear immediately after Obsidian starts, showing changes that were made before the session began.

**Phase:** Hardening phase -- this is already identified in PROJECT.md as an active requirement.

**Confidence:** HIGH -- directly confirmed by Obsidian's official `cachedRead` documentation.

**Sources:**
- [cachedRead documentation](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead)
- [Vault API docs](https://docs.obsidian.md/Plugins/Vault)

## Moderate Pitfalls

### Pitfall 6: saveData Concurrent Writes Silently Lose Updates

**What goes wrong:** When adding diff persistence via `saveData()`, multiple rapid external changes can each trigger a save. Since `saveData()` is async and writes the entire `data.json` atomically, two concurrent calls can result in a read-modify-write race: Call A reads state, Call B reads state, Call A writes, Call B writes (overwriting A's changes).

**Why it happens:** The common pattern `this.settings.foo = bar; await this.saveData(this.settings)` is not atomic. If two async paths both modify `this.settings` and call `saveData()`, the second write includes its own changes but may not include the first write's changes if both read from the same in-memory object before either wrote.

**Prevention:**
- Debounce saves: don't save on every single diff event. Batch saves with a 500ms-1s debounce.
- Use a single in-memory state object as source of truth and save it periodically or on meaningful state transitions (diff added, diff resolved, plugin unload).
- Ensure the save path is serialized: queue saves so only one `saveData()` call is in-flight at a time.

**Detection:** Diffs appear to be lost after rapid sequences of external changes. Closing and reopening Obsidian shows fewer pending diffs than expected.

**Phase:** Persistence phase.

**Confidence:** MEDIUM -- the race condition is structurally present in any async read-modify-write pattern; confirmed indirectly by data.json corruption issues in other plugins.

**Sources:**
- [obsidian-iconize data.json corruption](https://github.com/FlorianWoelki/obsidian-iconize/issues/669)

---

### Pitfall 7: Settings Schema Migration on Plugin Update

**What goes wrong:** When adding new settings (fold margin, fold minSize, exclude patterns, internal-vs-external tracking mode), existing users who update the plugin have `data.json` with the old schema. The `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())` pattern handles missing keys (they get defaults), but does NOT handle:
- Renamed keys (old key persists, new key gets default)
- Changed value types (e.g., changing `debounceMs` from number to an object)
- Removed keys (old key stays in `data.json` forever as dead weight)

**Why it happens:** Obsidian's `loadData()` returns raw JSON with no schema validation. The `Object.assign` merge is shallow -- it only covers one level of nesting.

**Prevention:**
- For the current scope (adding a few new settings), `Object.assign` with defaults is sufficient -- new keys get defaults, existing keys are preserved.
- Add a `settingsVersion` field to the settings interface. When loading, if version is missing or old, run a migration function.
- Keep migrations simple: only migrate when you actually rename or restructure. Adding new keys with defaults needs no migration.
- Never deeply nest settings objects -- keep them flat so `Object.assign` works correctly.

**Detection:** Users report settings "resetting" after plugin update. Or old settings from a previous version cause unexpected behavior because their shape doesn't match what the code expects.

**Phase:** Settings expansion phase -- add the version field when introducing the first batch of new settings.

**Confidence:** MEDIUM -- this is a general plugin development pattern. The current code's `Object.assign` approach handles the simple case (adding new flat keys) correctly.

---

### Pitfall 8: Snapshot Map Unbounded Memory Growth

**What goes wrong:** `FileWatcher.snapshots` stores the full text content of every markdown file in the vault. For a vault with 10,000 notes, this can consume hundreds of megabytes of memory, duplicating what Obsidian already caches internally.

**Why it happens:** The current design snapshots all markdown files on load to enable diffing against the previous known state. There is no filtering, eviction, or lazy loading.

**Prevention:**
- When implementing folder/file exclusion settings, apply the filter at snapshot time: don't snapshot excluded files.
- For very large vaults, consider lazy snapshotting: only snapshot a file when it's first modified (use `vault.read()` at that point to get baseline).
- Add a file size limit: skip snapshotting files larger than a configurable threshold (e.g., 1MB).
- Clear snapshots for files that haven't been modified in a long time (LRU eviction) if memory becomes a concern.

**Detection:** Obsidian memory usage is noticeably higher with the plugin enabled. Task manager shows increasing memory over time.

**Phase:** Settings/configuration phase (file exclusion) and performance phase.

**Confidence:** HIGH -- directly visible in the code (`snapshots` Map in FileWatcher.ts line 7) and identified in CONCERNS.md.

---

### Pitfall 9: MergeView Large File Freeze

**What goes wrong:** CodeMirror Merge's diff computation can freeze the browser tab for very large files (50K+ lines) or when comparing two completely different files. The patience diff algorithm is O(n*m) in the worst case.

**Why it happens:** The diff runs on the main thread. CodeMirror 6's merge view had documented cases of freezing for 20+ minutes on 182K-line files. While a fast-path fix was applied for extreme cases, the plugin's custom `patienceDiff` implementation runs before MergeView even gets the data.

**Consequences:** Obsidian's entire UI freezes. User cannot interact with any part of the app until the diff completes. No progress indicator is shown.

**Prevention:**
- Add a file size check before computing diffs. For files above a threshold (e.g., 30K lines), show a warning and offer to skip or show a simplified diff.
- Consider running `patienceDiff` in a Web Worker for large files (requires bundling the worker separately).
- Add a timeout: if diff computation takes longer than 2 seconds, abort and show a fallback message.

**Detection:** Obsidian freezes when a large file is externally modified. The diff tab eventually appears but the UI was unresponsive.

**Phase:** Performance optimization phase.

**Confidence:** HIGH -- documented in CodeMirror Merge issue tracker with specific file size thresholds.

**Sources:**
- [CodeMirror Merge slow diff](https://discuss.codemirror.net/t/codemirror-merge-slow-diff/7005)

---

### Pitfall 10: Fold Widget Click Handlers Referencing Destroyed Editors

**What goes wrong:** The custom fold widgets in `foldUnchanged.ts` register click event listeners that dispatch effects to `view` (the EditorView). If the full re-render pattern destroys the MergeView while a fold widget's click handler still holds a reference to the old editor, clicking causes a crash or silent failure.

**Why it happens:** Widget `toDOM()` captures `view` in a closure (line 36 of foldUnchanged.ts). The widget's DOM element may persist briefly after the editor is destroyed (e.g., during animation or if the DOM hasn't been garbage collected). `ignoreEvent` returns `true` for MouseEvent, so clicks go through the widget's own `addEventListener`, not through CM's event system.

**Prevention:**
- This pitfall is resolved by fixing Pitfall 3 (stop destroying all MergeViews on every render). If MergeViews are cached and reused, the editor references in fold widgets remain valid.
- As a defensive measure, add a guard in the click handler: check if the editor's DOM is still connected before dispatching.
- Alternatively, use CM6's `ViewPlugin` pattern which has proper lifecycle management and cleanup.

**Detection:** Clicking a fold widget after another diff was accepted/rejected causes a console error or does nothing. Intermittent -- depends on timing.

**Phase:** Performance optimization phase (resolved by MergeView caching).

**Confidence:** MEDIUM -- the vulnerability is structurally present in the code, but the actual crash depends on timing and garbage collection.

## Minor Pitfalls

### Pitfall 11: onLayoutReady vs Event Registration Timing

**What goes wrong:** The plugin registers vault events (`modify`, `create`, `delete`, `rename`) in `onload()` but defers `FileWatcher.start()` to `onLayoutReady()`. Vault events can fire between `onload()` and `onLayoutReady()` -- before snapshots exist. The `handleModify` handler will see `oldContent === undefined` and silently update the snapshot without detecting a change, which is the correct behavior. But `handleCreate` will snapshot with `cachedRead()`, which at this early stage is more likely to return stale content.

**Prevention:**
- The current code actually handles this correctly for `handleModify` (the `oldContent === undefined` check on line 40 skips diffing).
- For extra safety, add a `started` flag to FileWatcher and skip all event handlers until `start()` completes.

**Detection:** Rare false positive diffs on files created during Obsidian startup.

**Phase:** Hardening phase -- low priority, current code is mostly safe.

**Confidence:** MEDIUM -- the timing window exists but the current guards likely prevent issues in practice.

---

### Pitfall 12: data.json Key Namespace Collision

**What goes wrong:** If diff persistence stores paths as top-level keys alongside settings in `data.json`, a file path could collide with a settings key name. For example, a vault file at `settings.md` or `enabled.md` could collide with the `enabled` or `settings` keys.

**Why it happens:** `saveData()` writes a flat JSON object. If both settings and diff data share the same namespace, collisions are possible. The obsidian-iconize plugin had this exact bug with a folder named "settings".

**Prevention:**
- Structure `data.json` with explicit namespaces: `{ settings: {...}, pendingDiffs: {...} }`.
- Never mix file-path-keyed data with configuration at the same object level.

**Detection:** Settings corrupted after a file with a conflicting name gets a pending diff.

**Phase:** Persistence phase -- architectural decision at the start.

**Confidence:** HIGH -- documented bug in obsidian-iconize plugin.

**Sources:**
- [obsidian-iconize data.json corruption](https://github.com/FlorianWoelki/obsidian-iconize/issues/669)

---

### Pitfall 13: Workspace Quit Event Unreliability for Saving State

**What goes wrong:** Attempting to save diff state on `workspace.on('quit')` does not reliably work. On macOS, quit handlers may require double-quit to actually close Obsidian. Obsidian intentionally blocks layout saving on quit to preserve pop-out window state.

**Prevention:**
- Do NOT rely on quit events for critical persistence. Save state on meaningful transitions: when a diff is added, accepted, or rejected.
- Use debounced saves (e.g., save 1 second after the last state change) rather than trying to save at shutdown.
- `getState()` is called automatically by Obsidian when saving workspace layout -- this is reliable and doesn't need manual triggering.

**Detection:** Pending diffs lost after Obsidian quits, despite persistence code being implemented.

**Phase:** Persistence phase.

**Confidence:** HIGH -- documented in Obsidian forum with specific macOS reproduction.

**Sources:**
- [Persisting view state on close](https://forum.obsidian.md/t/persisting-my-view-state-when-closing-obsidian/105036)

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Diff persistence | Pitfall 1 (setState ordering), Pitfall 2 (workspace.json bloat), Pitfall 12 (key collision) | Two-phase init; store content in data.json not workspace.json; namespace keys |
| Diff persistence | Pitfall 4 (vault.modify race), Pitfall 13 (quit event unreliability) | Re-read before write; save on state transitions, not quit |
| Settings expansion | Pitfall 7 (schema migration) | Add settingsVersion field; keep settings flat |
| File exclusion config | Pitfall 8 (memory growth) | Filter snapshots at collection time based on exclusion patterns |
| Performance optimization | Pitfall 3 (full re-render), Pitfall 10 (stale widget refs) | Cache MergeViews; incremental DOM updates |
| Performance optimization | Pitfall 9 (large file freeze) | Size check before diff; timeout; Web Worker |
| Initial snapshot fix | Pitfall 5 (cachedRead staleness) | Use vault.read() for initial pass |
| Concurrent writes | Pitfall 6 (saveData races) | Debounce saves; serialize write queue |

## Sources

- [Obsidian cachedRead API docs](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead)
- [Obsidian Vault API docs](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian view state ordering issue](https://forum.obsidian.md/t/ordering-issues-when-using-view-state/70487)
- [Obsidian setState inconsistency](https://forum.obsidian.md/t/api-the-calls-to-views-setstate-are-inconsistent-or-poorly-documented/67097)
- [Obsidian view state persistence on close](https://forum.obsidian.md/t/persisting-my-view-state-when-closing-obsidian/105036)
- [Templater vault.modify race condition](https://github.com/SilentVoid13/Templater/issues/1629)
- [obsidian-iconize data.json corruption](https://github.com/FlorianWoelki/obsidian-iconize/issues/669)
- [CodeMirror MergeView reconfigure](https://discuss.codemirror.net/t/merge-view-how-to-update-configuration-without-re-instance-the-merge-view/5402)
- [CodeMirror EditorView.destroy widget cleanup](https://discuss.codemirror.net/t/does-editorview-destroy-call-destroy-on-widgets/7370)
- [CodeMirror Merge slow diff](https://discuss.codemirror.net/t/codemirror-merge-slow-diff/7005)

---

*Pitfalls audit: 2026-03-03*
