# Technology Stack: Persistence, Settings, and Performance

**Project:** Obsidian Diff Viewer (subsequent milestone)
**Researched:** 2026-03-03
**Scope:** What APIs/patterns to use for diff persistence, settings expansion, and incremental rendering

## Context

The plugin already has a working diff viewer with CodeMirror MergeView, patience diff, FileWatcher, and e2e tests. This research covers what's needed to add:
1. Persistent diff storage across Obsidian reloads
2. Expanded configurable settings (fold context, exclusion patterns, change tracking mode)
3. Incremental re-rendering (update one file's diff without destroying all MergeViews)

---

## 1. Data Persistence

### Use `Plugin.loadData()` / `Plugin.saveData()` for ALL persistent data

**Confidence:** HIGH (verified from obsidian.d.ts type definitions, Obsidian official docs)

| Method | Signature | Since | Behavior |
|--------|-----------|-------|----------|
| `loadData()` | `Promise<any>` | 0.9.7 | Reads `.obsidian/plugins/<plugin-id>/data.json` from disk |
| `saveData(data)` | `Promise<void>` | 0.9.7 | Writes object as JSON to `data.json` |
| `onExternalSettingsChange()` | `any` (optional) | 1.5.7 | Called when `data.json` changes externally (sync services) |

**Why this, not separate files:** The `data.json` approach is the standard Obsidian plugin pattern. Settings and operational state should live in the same file. The `saveData` call serializes the entire object to JSON atomically -- there is no append or partial-write API. Keeping everything in one object avoids managing file I/O manually.

**Why not `vault.adapter.write()`:** The `DataAdapter` exposes `read()`/`write()`/`exists()`/`mkdir()` for arbitrary file paths, but using it for plugin state has drawbacks:
- Not automatically handled by Obsidian Sync
- No `onExternalSettingsChange` notifications for custom files
- Requires manual path construction via `this.manifest.dir` or `this.app.vault.configDir`
- More code, more failure modes, no benefit for our data sizes

### Storage Schema Design

**Confidence:** HIGH (pattern verified across official sample plugin and community plugins)

Store settings and pending diffs in a single typed object:

```typescript
interface PluginData {
  settings: ExternalDiffSettings;
  pendingDiffs: Record<string, SerializedDiff>;
}

interface SerializedDiff {
  oldContent: string;
  newContent: string;
  timestamp: number;  // for staleness checks
}
```

**Key pattern:** Use `Object.assign({}, DEFAULTS, await this.loadData())` to merge loaded data with defaults. This is what the plugin already does for settings. Extend it to include pending diffs.

```typescript
async loadSettings() {
  const data = (await this.loadData()) as Partial<PluginData> ?? {};
  this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  this.pendingDiffs = new Map(
    Object.entries(data.pendingDiffs ?? {}).map(([k, v]) => [k, this.rehydrateDiff(k, v)])
  );
}

async saveAll() {
  const serialized: Record<string, SerializedDiff> = {};
  for (const [path, diff] of this.pendingDiffs) {
    serialized[path] = { oldContent: diff.oldContent, newContent: diff.newContent, timestamp: Date.now() };
  }
  await this.saveData({ settings: this.settings, pendingDiffs: serialized });
}
```

### Data Size Considerations

**Confidence:** MEDIUM (no official size limit documented, but practical limits exist)

Pending diffs store full file contents (oldContent + newContent). For typical markdown files (1-50KB each), storing 5-10 pending diffs means 10-500KB in `data.json`. This is well within reasonable limits -- `saveData` serializes to JSON and writes atomically.

**Mitigation for large diffs:** Cap stored diffs at a reasonable count (e.g., 20 files). If more accumulate, the oldest get dropped. This prevents `data.json` from growing unbounded if a user ignores many diffs.

### Implement `onExternalSettingsChange()`

**Confidence:** HIGH (verified in obsidian.d.ts, documented since v1.5.7)

```typescript
onExternalSettingsChange() {
  this.loadSettings();  // re-reads data.json
}
```

This fires when Obsidian Sync or external programs modify `data.json`. Without it, settings changes from another device won't take effect until plugin reload.

---

## 2. Settings UI Expansion

### Obsidian Setting Components

**Confidence:** HIGH (verified from obsidian.d.ts and community documentation)

The `Setting` class provides these input components via builder methods:

| Method | Component | Use Case |
|--------|-----------|----------|
| `addToggle()` | `ToggleComponent` | Boolean settings (enabled, tracking mode) |
| `addText()` | `TextComponent` | String/number inputs (debounce ms, fold margin) |
| `addTextArea()` | `TextAreaComponent` | Multi-line text (exclusion patterns) |
| `addDropdown()` | `DropdownComponent` | Enum selection (tracking mode) |
| `addSlider()` | `SliderComponent` | Numeric range (fold context lines) |

### Settings to Add

Expand `ExternalDiffSettings` interface:

```typescript
export interface ExternalDiffSettings {
  // Existing
  enabled: boolean;
  debounceMs: number;
  // New
  trackingMode: "external-only" | "all";
  excludePatterns: string[];   // glob patterns like "templates/**"
  foldMargin: number;          // lines of context around changes (default: 2)
  foldMinSize: number;         // minimum foldable region size (default: 4)
}
```

### Recommended UI Controls

| Setting | Component | Why |
|---------|-----------|-----|
| Tracking mode | `addDropdown()` | Two clear options, dropdown prevents invalid values |
| Exclude patterns | `addTextArea()` | Users need to enter multiple glob patterns, one per line |
| Fold margin | `addSlider()` | Bounded numeric range (0-10), slider is intuitive |
| Fold min size | `addSlider()` | Bounded numeric range (2-20), same reasoning |

**Do NOT use:** `addText()` for numeric settings that have clear bounds. Sliders prevent invalid input without manual parsing/validation. The current `debounceMs` uses `addText()` with manual parseInt -- consider migrating it to `addSlider()` as well.

---

## 3. CodeMirror 6 MergeView Performance

### Incremental Rendering: Keep MergeViews Alive

**Confidence:** HIGH (verified from @codemirror/merge 6.7.6 type definitions in node_modules)

The current `render()` method in DiffView.ts destroys ALL MergeView instances and recreates them whenever any file changes. This is the core performance problem.

**Solution:** Track MergeViews by file path and only create/destroy the one that changed.

```typescript
// Instead of render() destroying everything:
addFile(path: string, diff: PendingDiff): void {
  const existing = this.sections.get(path);
  if (existing?.mergeView) {
    existing.mergeView.destroy();  // only destroy this one
  }
  this.sections.set(path, { diff, expanded: true, mergeView: null, mergeContainer: null });
  this.renderSection(path);  // render just this section
}
```

### MergeView.reconfigure() for Config Changes

**Confidence:** HIGH (verified from installed @codemirror/merge type definitions)

```typescript
reconfigure(config: MergeConfig): void;
```

`MergeConfig` accepts: `orientation`, `revertControls`, `renderRevertControl`, `highlightChanges`, `gutter`, `collapseUnchanged`, `diffConfig`.

Use `reconfigure()` when settings change (e.g., fold margin/minSize), instead of destroying and recreating. This preserves scroll position and fold state.

```typescript
// When fold settings change:
for (const section of this.sections.values()) {
  section.mergeView?.reconfigure({
    collapseUnchanged: { margin: settings.foldMargin, minSize: settings.foldMinSize },
  });
}
```

**Important note:** The plugin currently uses a custom fold system (`foldUnchanged.ts`) instead of the built-in `collapseUnchanged`. `reconfigure()` would only help if migrating to the built-in collapse. For the custom fold system, settings changes require dispatching new `setFoldRanges` effects to each editor, not a full recreate.

### Built-in `collapseUnchanged` vs Custom Fold System

**Confidence:** HIGH (verified from type definitions)

The `@codemirror/merge` package has a built-in `collapseUnchanged` option (added in v6.7.0):

```typescript
collapseUnchanged?: { margin?: number; minSize?: number; };
```

It also exports `uncollapseUnchanged: StateEffectType<number>` for programmatic expand.

The plugin currently uses a custom fold system in `foldUnchanged.ts` that provides per-region expand/collapse with synchronized expand across both editors. **Keep the custom system** because:
1. The built-in `collapseUnchanged` doesn't expose per-region toggle with sync callbacks
2. The custom system is already working and tested
3. Migrating would require verifying feature parity

However, when settings change (margin/minSize), recompute and dispatch new fold ranges rather than recreating the MergeView:

```typescript
// Recompute folds with new settings, no MergeView recreation needed
const rangesA = computeUnchangedRanges(mv.a.state.doc, mv.chunks, "a", newMargin, newMinSize);
const rangesB = computeUnchangedRanges(mv.b.state.doc, mv.chunks, "b", newMargin, newMinSize);
mv.a.dispatch({ effects: setFoldRanges.of(rangesA) });
mv.b.dispatch({ effects: setFoldRanges.of(rangesB) });
```

### DiffConfig Performance Options

**Confidence:** HIGH (verified from installed type definitions and changelog)

```typescript
interface DiffConfig {
  scanLimit?: number;   // Limits depth of expensive diff computation
  timeout?: number;     // Bail out after N milliseconds (v6.9.0+)
  override?: (a: string, b: string) => readonly Change[];  // Custom diff (v6.12.0+)
}
```

The plugin already uses `diffConfig: { override: lineDiff }` with the patience diff algorithm. This bypasses the built-in diff entirely, so `scanLimit` and `timeout` don't apply to our custom diff. If patience diff becomes slow on very large files, add a timeout wrapper around `patienceDiff()` ourselves.

### `Chunk.precise` Property

**Confidence:** HIGH (verified from type definitions)

```typescript
readonly precise: boolean;  // false when diff fell back to imprecise mode
```

Added in v6.9.0. Since we override the diff algorithm, this will always be `true` (our override doesn't set it to false). Not immediately useful but worth knowing.

---

## 4. vault.read() vs vault.cachedRead()

### Switch to `vault.read()` for Initial Snapshots

**Confidence:** HIGH (verified from obsidian.d.ts docstrings and official docs)

From the API docs:
- `read(file: TFile): Promise<string>` -- "Read a plaintext file directly from disk. Use this if you intend to modify the file content afterwards."
- `cachedRead(file: TFile): Promise<string>` -- Returns cached version, may be stale if file was modified externally before Obsidian detected the change.

The FileWatcher currently uses `cachedRead()` for initial snapshots AND for reading file content on modify events. The problem: if a file was modified externally between Obsidian launches, `cachedRead()` may return stale content, causing the first diff to be inaccurate.

**Fix:** Use `vault.read()` in `FileWatcher.start()` for initial snapshots. Continue using `cachedRead()` in `handleModify()` -- by the time a modify event fires, the cache has been invalidated.

```typescript
// FileWatcher.start() -- change cachedRead to read
const content = await this.app.vault.read(file);
this.snapshots.set(file.path, content);
```

---

## 5. What NOT to Use

### Do NOT use `vault.adapter.write()` for plugin state
**Why:** No sync support, no external change detection, manual path management. `saveData()` is simpler and correct.

### Do NOT use Node.js `fs` module
**Why:** Desktop-only, breaks if the plugin ever needs mobile support. Even though this plugin is desktop-only now, the `DataAdapter` API is the platform-abstracted way to do file I/O.

### Do NOT use `collapseUnchanged` built-in to replace the custom fold system
**Why:** The custom system provides per-region synchronized expand/collapse, which the built-in doesn't support. Migration risk for no clear benefit.

### Do NOT debounce `saveData()` for settings changes
**Why:** Settings changes are infrequent (user clicks a toggle). Debouncing adds complexity for no benefit. DO debounce `saveData()` for pending diff storage -- these can change rapidly when external tools modify multiple files.

### Do NOT store serialized MergeView state (scroll position, selections)
**Why:** MergeViews are recreated from scratch on reload anyway. Storing CM6 editor state for restoration is complex and fragile. Restoring the diff content itself is sufficient.

---

## Recommended Stack Additions

### Core (no new packages needed)

| Technology | Already Present | Purpose | Why |
|------------|----------------|---------|-----|
| `Plugin.loadData/saveData` | Yes (obsidian API) | Diff persistence | Standard Obsidian persistence API, handles data.json automatically |
| `Plugin.onExternalSettingsChange` | Available (v1.5.7+) | Settings sync | Handles Obsidian Sync and external data.json changes |
| `Setting.addDropdown/addSlider` | Yes (obsidian API) | Settings UI | Built-in components, no custom UI needed |
| `MergeView.reconfigure()` | Yes (@codemirror/merge) | Config updates without recreate | Preserves scroll/fold state when settings change |
| `vault.read()` | Yes (obsidian API) | Accurate initial snapshots | Reads from disk, not cache -- avoids stale content |

### No new npm dependencies required

Everything needed for this milestone is already available through the existing `obsidian` and `@codemirror/merge` packages. No additional libraries need to be installed.

---

## Sources

### Official / Verified (HIGH confidence)
- Obsidian API type definitions: `node_modules/obsidian/obsidian.d.ts` (installed, verified directly)
- @codemirror/merge type definitions: `node_modules/@codemirror/merge/dist/index.d.ts` (installed, verified directly)
- [Obsidian Developer Docs: saveData](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData)
- [Obsidian Developer Docs: Plugin class](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Developer Docs: Vault](https://docs.obsidian.md/Plugins/Vault)
- [Obsidian Developer Docs: cachedRead](https://docs.obsidian.md/Reference/TypeScript+API/Vault/cachedRead)
- [@codemirror/merge changelog](https://github.com/codemirror/merge/blob/main/CHANGELOG.md)

### Community / WebSearch (MEDIUM confidence)
- [DeepWiki: Plugin Development](https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development) -- confirmed lifecycle and persistence patterns
- [Obsidian Forum: Plugin data persistence](https://forum.obsidian.md/t/how-could-plugin-persist-data/55959)
- [Obsidian Forum: Settings storage](https://forum.obsidian.md/t/what-goes-where-the-plugin-settings/72309)
- [Obsidian Forum: Plugin folder file access](https://forum.obsidian.md/t/how-can-i-access-files-within-my-plugin-folder/89561)
- [CM6 MergeView performance issue #1106](https://github.com/codemirror/dev/issues/1106)
- [CM6 MergeView reconfigure discussion](https://discuss.codemirror.net/t/merge-view-how-to-update-configuration-without-re-instance-the-merge-view/5402)
- [CM6 Reconfiguring unified merge view #1515](https://github.com/codemirror/dev/issues/1515)
