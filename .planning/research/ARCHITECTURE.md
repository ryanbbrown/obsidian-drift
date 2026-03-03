# Architecture Patterns

**Domain:** Obsidian plugin -- diff persistence, settings expansion, incremental rendering
**Researched:** 2026-03-03

## Current Architecture (Baseline)

The existing plugin follows a linear pipeline:

```
Vault Event -> FileWatcher -> ExternalDiffPlugin -> DiffView -> MergeView
```

State is held in four in-memory Maps/Sets:
- `FileWatcher.snapshots` -- last known file contents (full vault)
- `FileWatcher.pendingExternalPaths` -- files with unresolved diffs
- `ExternalDiffPlugin.pendingDiffs` -- PendingDiff objects (old/new + callbacks)
- `DiffView.sections` -- FileSection objects (diff, expanded, MergeView instance)

All state is ephemeral. Reload = lost diffs. Every file change triggers full DOM teardown and rebuild of all sections.

## Recommended Architecture

### Overview

Add two new components -- `DiffStore` for persistence and `SettingsManager` for expanded config -- while refactoring `DiffView.render` from full-rebuild to per-section incremental updates.

```
                          +---------------+
                          |  SettingsManager  |
                          | (expanded config) |
                          +-------+-------+
                                  |
Vault Event -> FileWatcher -----> ExternalDiffPlugin
                                  |           |
                                  v           v
                              DiffStore    DiffView
                             (persist)   (incremental)
                                  |           |
                                  +-----+-----+
                                        |
                                    MergeView
                                   (per-section)
```

### Component Boundaries

| Component | Responsibility | Communicates With | Owns |
|-----------|---------------|-------------------|------|
| `ExternalDiffPlugin` (main.ts) | Orchestration, lifecycle, command registration | All components | Plugin lifecycle, component wiring |
| `FileWatcher` (FileWatcher.ts) | Detect external changes, filter internal edits | Plugin (callbacks), SettingsManager (reads config) | Snapshots, debounce timers, internal-edit markers |
| `DiffStore` (NEW: diffStore.ts) | Serialize/deserialize pending diffs to disk | Plugin (read/write), DiffView (restore on open) | Persisted diff data in data.json |
| `DiffView` (DiffView.ts) | Render diff sections, manage MergeView lifecycles | Plugin (receives diffs), DiffStore (restore state) | DOM sections map, MergeView instances |
| `SettingsManager` (settings.ts) | Expanded configuration UI and validation | Plugin (saves), FileWatcher (reads), DiffView (reads fold config) | Settings state |
| Fold System (foldUnchanged.ts) | Collapse/expand unchanged regions | DiffView (initialization), SettingsManager (margin/minSize) | CodeMirror StateField |

### Data Flow with Persistence

**On external change (runtime):**

```
1. Vault 'modify' event fires
2. FileWatcher.handleModify detects external change (snapshot mismatch)
3. FileWatcher calls onExternalChange(path, oldContent, newContent)
4. ExternalDiffPlugin.handleExternalChange:
   a. Creates PendingDiff with callbacks
   b. Stores in pendingDiffs Map
   c. Calls DiffStore.save(pendingDiffs)       <-- NEW: persist
   d. If DiffView open -> addFile (incremental) <-- CHANGED: no full rebuild
      Else -> openDiffTab -> addFile
```

**On plugin load (restore):**

```
1. ExternalDiffPlugin.onload()
2. Load settings via loadData()
3. DiffStore.load() reads persisted diffs from data.json
4. FileWatcher.start() snapshots all markdown files
5. For each persisted diff:
   a. Check if file still exists in vault
   b. Check if file content matches persisted newContent (change still pending)
   c. If valid: recreate PendingDiff with callbacks, add to pendingDiffs
   d. If stale: discard (file was resolved externally)
6. workspace.onLayoutReady -> if pending diffs exist, open DiffView
```

**On accept/reject:**

```
1. User clicks Accept or Reject in DiffView
2. DiffView calls onAccept(content) or onReject()
3. Plugin callback:
   a. Updates vault file (if needed)
   b. Updates FileWatcher snapshot
   c. Removes from pendingDiffs Map
   d. Calls DiffStore.save(pendingDiffs)       <-- NEW: persist removal
4. DiffView.removeFile(path)                    <-- CHANGED: incremental DOM removal
```

## Component Designs

### DiffStore (NEW)

**Purpose:** Persist pending diffs across Obsidian reloads using the plugin's `data.json`.

**Design decision: Store diffs in data.json alongside settings.**

Obsidian plugins persist data via `Plugin.saveData()` / `Plugin.loadData()`, which writes to `.obsidian/plugins/<id>/data.json`. This is the only officially supported persistence mechanism. There are no documented size limits, but data must be JSON-serializable.

Storing diff content (old + new strings) in data.json is acceptable because:
- Pending diffs are a small working set (typically 1-10 files)
- Each diff stores two copies of file content, so ~10 files at ~10KB each = ~200KB total, well within reason
- Alternative approaches (writing separate files to the vault) violate the principle that plugins should not create user-visible files without explicit intent

**Data schema:**

```typescript
interface PersistedDiff {
  path: string;
  oldContent: string;
  newContent: string;
  timestamp: number;  // when the diff was detected, for staleness checks
}

interface PluginData {
  settings: ExternalDiffSettings;
  pendingDiffs: PersistedDiff[];
}
```

**Key behaviors:**
- `save()` serializes all pending diffs and calls `plugin.saveData()`
- `load()` deserializes and returns `PersistedDiff[]`
- Staleness check on restore: if `vault.read(path)` does not match `newContent`, the diff was resolved externally while Obsidian was closed -- discard it
- Debounce saves: multiple rapid changes should coalesce into one `saveData()` call (reuse the 500ms debounce pattern)
- Callbacks (`onAccept`/`onReject`) are NOT serialized -- they are recreated by `ExternalDiffPlugin` on restore using `makeDiffCallbacks()`

**Confidence: HIGH.** Obsidian's `saveData`/`loadData` is the standard persistence mechanism. Storing content strings in JSON is straightforward. The staleness check on reload is the critical correctness piece.

### DiffView Incremental Rendering (REFACTOR)

**Problem:** Current `render()` calls `container.empty()` and rebuilds all sections. Adding or removing one file destroys all MergeView instances, losing scroll position, fold state, and selections.

**Solution: Section-level DOM management.**

Replace the single `render()` method with targeted operations:

```typescript
// Instead of:
addFile(path, diff) { this.sections.set(...); this.render(); }

// Use:
addFile(path, diff) {
  this.sections.set(path, {...});
  this.appendSection(path);  // only creates DOM for this one file
}

removeFile(path) {
  const section = this.sections.get(path);
  section?.mergeView?.destroy();
  section?.element?.remove();  // remove just this DOM subtree
  this.sections.delete(path);
  if (this.sections.size === 0) this.leaf.detach();
}
```

**Key changes to FileSection:**

```typescript
interface FileSection {
  diff: PendingDiff;
  expanded: boolean;
  mergeView: MergeView | null;
  mergeContainer: HTMLElement | null;
  element: HTMLElement | null;  // NEW: reference to the section's root DOM element
}
```

**Section creation (`appendSection`):**
- Creates the section block, header, buttons, and merge container
- Appends to the scroll area (does NOT clear existing content)
- If `expanded`, calls `createMergeView()` for this section only

**Section update (when same file gets a new external change while diff is open):**
- Destroy old MergeView for that section only
- Update the PendingDiff in the section
- Recreate MergeView with new content
- Other sections remain untouched

**MergeView content update vs. recreation:**

CodeMirror MergeView exposes `a` and `b` as `EditorView` instances. You can dispatch document replacements:

```typescript
// Replace entire content of editor A
mergeView.a.dispatch({
  changes: { from: 0, to: mergeView.a.state.doc.length, insert: newContent }
});
```

However, this approach has a significant limitation for diffs: the MergeView's diff computation is tied to the initial documents. Replacing content in one editor does NOT automatically recompute chunks and highlighted changes. The diff is computed once during construction and updated incrementally for edits, but wholesale replacement breaks the diff alignment.

**Recommendation:** For content updates to the same file (re-diff), destroy and recreate the MergeView for that specific section only. Do NOT destroy other sections' MergeViews. The `reconfigure` method on MergeView is for changing display options (highlight, gutter, orientation), not for replacing documents.

**Confidence: HIGH.** This is standard incremental DOM management. The key insight is that MergeView instances must be recreated per-section when content changes, but sections themselves can be managed independently.

### Settings Expansion (REFACTOR)

**Current state:** `ExternalDiffSettings` has only `enabled: boolean` and `debounceMs: number`.

**Expanded settings:**

```typescript
interface ExternalDiffSettings {
  // Existing
  enabled: boolean;
  debounceMs: number;

  // Fold configuration (currently hardcoded as margin: 2, minSize: 4)
  foldMargin: number;       // lines of context around changed regions
  foldMinSize: number;      // minimum unchanged lines before folding

  // File filtering
  watchMode: "external-only" | "all";           // internal+external vs external-only
  excludePatterns: string[];                      // glob patterns for files/folders to skip

  // Display
  autoOpen: boolean;        // auto-open diff view on external change (default: true)
}
```

**Settings flow into components:**

```
SettingsManager
  |
  +--> FileWatcher (reads: enabled, debounceMs, watchMode, excludePatterns)
  |      FileWatcher.handleModify checks excludePatterns before processing
  |      FileWatcher.start filters snapshot set by excludePatterns
  |
  +--> DiffView (reads: foldMargin, foldMinSize)
  |      Passed to computeUnchangedRanges(doc, chunks, side, settings.foldMargin, settings.foldMinSize)
  |
  +--> ExternalDiffPlugin (reads: autoOpen)
         handleExternalChange checks autoOpen before opening tab
```

**Exclude pattern implementation:**

Use Obsidian's built-in path matching or a minimal glob matcher. The `excludePatterns` array holds strings like `"templates/"`, `"*.generated.md"`, `"daily/"`. FileWatcher checks each path against patterns before processing.

```typescript
// In FileWatcher.handleModify, early return:
if (this.isExcluded(file.path)) return;

private isExcluded(path: string): boolean {
  return this.settings.excludePatterns.some(pattern => {
    if (pattern.endsWith('/')) return path.startsWith(pattern);
    // Simple glob: convert * to regex
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return re.test(path) || re.test(path.split('/').pop() ?? '');
  });
}
```

**Settings UI:** Extend `ExternalDiffSettingTab` with:
- Toggle for `watchMode`
- Text area for `excludePatterns` (one per line, like .gitignore)
- Number inputs for `foldMargin` and `foldMinSize` with validation (min 0, max 20)
- Toggle for `autoOpen`

**Confidence: HIGH.** This is standard Obsidian settings expansion. The fold parameters are already used as arguments in `computeUnchangedRanges` -- they just need to be sourced from settings instead of hardcoded.

### FileWatcher Filtering Integration

**Current behavior:** FileWatcher snapshots ALL markdown files on start and processes ALL modify events.

**With settings integration:**
- `start()` only snapshots files not matching `excludePatterns`
- `handleModify` checks `isExcluded()` before any processing
- `watchMode: "all"` removes the `recentlyEditedInternally` check, treating all changes (internal and external) as diff-worthy
- When `excludePatterns` change at runtime (settings update), FileWatcher should:
  1. Remove snapshots for newly-excluded paths
  2. Add snapshots for newly-included paths
  3. NOT trigger false diffs from the snapshot changes

**Confidence: MEDIUM.** The runtime pattern update path is tricky. Simplest approach: on settings change, call `FileWatcher.restart()` which destroys and reinitializes. This avoids incremental snapshot management complexity at the cost of a brief gap in monitoring.

## Patterns to Follow

### Pattern 1: Debounced Persistence

**What:** Coalesce rapid changes into a single `saveData()` call to avoid disk thrash.

**When:** Any time pending diffs change (add, accept, reject, content update).

**Example:**

```typescript
class DiffStore {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Schedule a debounced save of all pending diffs. */
  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.plugin.saveData(this.serialize());
    }, 500);
  }
}
```

### Pattern 2: Section-Keyed DOM Management

**What:** Each diff section owns its DOM subtree. Operations target individual sections, not the whole container.

**When:** Adding, removing, or updating a single file's diff.

**Example:**

```typescript
private appendSection(path: string): void {
  const section = this.sections.get(path);
  if (!section) return;
  const scrollArea = this.getOrCreateScrollArea();
  const block = scrollArea.createDiv({cls: "diff-view-section"});
  section.element = block;
  // ... build header, buttons, merge container within block
}
```

### Pattern 3: Stale Diff Detection on Restore

**What:** Validate persisted diffs against current vault state before restoring.

**When:** Plugin load, after `FileWatcher.start()` completes.

**Example:**

```typescript
async restoreDiffs(): Promise<void> {
  const persisted = await this.diffStore.load();
  for (const entry of persisted) {
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    if (!file || !(file instanceof TFile)) continue;  // file deleted
    const currentContent = await this.app.vault.read(file);
    if (currentContent === entry.oldContent) {
      // File reverted to pre-change state externally -- diff resolved
      continue;
    }
    if (currentContent !== entry.newContent) {
      // File changed to something else entirely -- update newContent
      entry.newContent = currentContent;
    }
    // Recreate the diff with fresh callbacks
    const diff = this.makeDiffCallbacks(entry.path, entry.oldContent, entry.newContent);
    this.pendingDiffs.set(entry.path, diff);
  }
}
```

### Pattern 4: Settings-Driven Component Configuration

**What:** Components read settings at construction/initialization, not at every call. Propagate changes through explicit update methods.

**When:** Settings change at runtime.

**Example:**

```typescript
// In ExternalDiffPlugin, after saveSettings():
this.fileWatcher.updateSettings(this.settings);
// FileWatcher re-evaluates exclude patterns, restarts if needed
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Full Rebuild on Any Change

**What:** Calling `container.empty()` and recreating all DOM elements when one section changes.

**Why bad:** Destroys MergeView instances (expensive CodeMirror editors), loses user state (scroll, fold, selections), causes visible flicker with many sections.

**Instead:** Section-keyed DOM management (Pattern 2). Only touch the section that changed.

### Anti-Pattern 2: Storing Callbacks in Persistence Layer

**What:** Attempting to serialize `onAccept`/`onReject` functions.

**Why bad:** Functions are not JSON-serializable. Even if you could serialize them, they close over runtime state (`this.app.vault`, `this.fileWatcher`) that does not exist at restore time.

**Instead:** Persist only data (path, oldContent, newContent, timestamp). Recreate callbacks from data using `makeDiffCallbacks()` on restore.

### Anti-Pattern 3: Eager Snapshot of Entire Vault

**What:** Reading every markdown file into memory on plugin load regardless of exclusion settings.

**Why bad:** A vault with 10,000 files means 10,000 `cachedRead()` calls and storing all contents in a Map. Wastes memory for files the user will never diff.

**Instead:** Apply `excludePatterns` filter BEFORE snapshotting. Only read files the user wants watched.

### Anti-Pattern 4: Replacing MergeView Document Content for Re-diff

**What:** Using `dispatch({changes: ...})` to replace content in a MergeView editor and expecting the diff to recompute.

**Why bad:** MergeView computes diffs on construction. In-place document replacement does cause incremental diff updates, but wholesale replacement (from: 0, to: length) produces poor diff results because the entire document appears as one giant change, not a meaningful diff.

**Instead:** Destroy and recreate the MergeView for that specific section. The creation cost is the diff computation (patience algorithm) which is fast for typical file sizes.

## Suggested Build Order

Dependencies between components dictate the implementation sequence:

### Phase 1: Settings Expansion

**Build first because:** Every subsequent component reads settings. FileWatcher filtering depends on `excludePatterns`. DiffView fold configuration depends on `foldMargin`/`foldMinSize`. DiffStore schema includes settings.

**Delivers:**
- Expanded `ExternalDiffSettings` interface
- Updated settings UI
- Settings plumbed to FileWatcher and DiffView
- FileWatcher exclude pattern filtering

**No dependencies on:** DiffStore, incremental rendering

### Phase 2: Incremental DiffView Rendering

**Build second because:** DiffStore restore needs incremental `addFile` to avoid full rebuilds when repopulating the view with multiple persisted diffs.

**Delivers:**
- Section-keyed DOM management (`appendSection`, targeted `removeFile`)
- FileSection owns its DOM element reference
- MergeView lifecycle scoped to individual sections
- Fold config from settings instead of hardcoded values

**Depends on:** Phase 1 (settings for fold config)

### Phase 3: Diff Persistence (DiffStore)

**Build last because:** It ties together settings (for data schema) and incremental rendering (for restore without flicker).

**Delivers:**
- `DiffStore` class with save/load/serialize/deserialize
- Plugin data schema combining settings + diffs
- Restore logic with staleness detection
- Debounced persistence on every diff add/resolve
- `onExternalSettingsChange` hook for sync scenarios

**Depends on:** Phase 1 (settings in data schema), Phase 2 (incremental addFile for restore)

## Scalability Considerations

| Concern | At 5 files | At 50 files | At 500 files |
|---------|-----------|------------|-------------|
| data.json size | ~100KB, instant | ~1MB, slight write delay | ~10MB, should warn/truncate |
| DiffView DOM | All visible | Virtualize (only render visible) | Must virtualize or paginate |
| MergeView instances | All created | Lazy-create on expand only | Lazy-create, destroy on collapse |
| Snapshot memory | Negligible | ~50MB if all large files | Must filter aggressively |
| Persistence writes | Instant | Debounce critical | Debounce + batch essential |

**Recommendation for this milestone:** Target the 5-50 file range. Implement lazy MergeView creation (only create when section is expanded). Add a data.json size warning if persisted diffs exceed 5MB. Virtualization is out of scope until needed.

## Sources

- [Obsidian Plugin saveData API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData) -- MEDIUM confidence (page structure confirmed, content loaded partially)
- [Obsidian data.json persistence pattern](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) -- HIGH confidence (confirmed: data.json in plugin folder, JSON-serializable, no documented size limits)
- [Obsidian ItemView setState/getState for view persistence](https://forum.obsidian.md/t/confused-about-the-setviewstate-and-state-management-of-the-itemview-class/66798) -- MEDIUM confidence (community discussion confirms workspace.json serialization, but API is poorly documented)
- [CodeMirror MergeView reconfigure method](https://discuss.codemirror.net/t/merge-view-how-to-update-configuration-without-re-instance-the-merge-view/5402) -- HIGH confidence (maintainer-confirmed, reconfigure is for config not documents)
- [@codemirror/merge CHANGELOG](https://github.com/codemirror/merge/blob/main/CHANGELOG.md) -- HIGH confidence (official changelog, confirmed updateOriginalDoc for unified views only, DiffConfig.override in 6.12.0)
- [CodeMirror MergeView document update limitations](https://github.com/codemirror/dev/issues/1515) -- MEDIUM confidence (issue confirms reconfigure bug was fixed, but wholesale document replacement in split MergeView not officially supported as a diff-recompute mechanism)
- [onExternalSettingsChange hook](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) -- HIGH confidence (available since v1.5.7, triggers when data.json modified externally)

---

*Architecture research: 2026-03-03*
