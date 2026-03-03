# Feature Landscape

**Domain:** Obsidian diff viewer plugin (external change detection and resolution)
**Researched:** 2026-03-03

## Table Stakes

Features users expect from a diff viewer plugin. Missing any of these and the plugin feels broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Side-by-side diff view | Every diff tool (VS Code, Git UIs, IntelliJ) shows side-by-side. Users have this mental model. | **DONE** | Using CodeMirror MergeView with patience diff. |
| Per-chunk accept/reject | VS Code, Cursor, and all modern diff UIs let users resolve individual hunks. Bulk-only is a dealbreaker. | **DONE** | Via MergeView `revertControls: "b-to-a"`. |
| Per-file accept/reject | When reviewing multi-file diffs, users need to accept or reject an entire file's changes at once. | **DONE** | Accept/Reject buttons in file section headers. |
| Auto-detect external changes | The core value proposition. If users have to manually trigger diffs, they'll forget or not bother. | **DONE** | FileWatcher with snapshot comparison. |
| Fold/collapse unchanged regions | Large files with small diffs become unusable without folding. VS Code and GitHub both fold unchanged regions. | **DONE** | Custom fold system with synchronized expand across both editors. |
| Diff persistence across reload | **CRITICAL GAP.** Every tool that manages pending state (VS Code, Git plugins, Obsidian Git) persists it. Losing diffs on reload means the user can never close Obsidian while changes are pending. This is the single most important missing feature. | Med | Requires serializing `pendingDiffs` to disk via `saveData`/`loadData` or `getState`/`setState`. Content strings can be large, so consider storing old content only (new content is the current file). |
| Correct old/new side orientation | Users universally expect old content on the left, new on the right. Getting this wrong is disorienting. | **ACTIVE** | Fix is in uncommitted DiffView.ts changes. |
| Configurable file exclusions | Users with `node_modules/`, `.git/`, template folders, or auto-generated content need to exclude paths. Obsidian Git plugin, File Ignore plugin, and Advanced Exclude plugin all provide this. Without it, the diff view floods with noise. | Med | Glob patterns or folder-based exclusion. The Obsidian ecosystem standard is .gitignore-style patterns. |

## Differentiators

Features that set this plugin apart from existing Obsidian diff tools. Not expected, but provide significant value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real-time external change detection | No existing Obsidian plugin auto-detects external changes and opens a diff view. Obsidian Git requires manual pull/diff. Version History Diff requires manually browsing history. This plugin is unique in its real-time, push-based approach. | **DONE** | Core differentiator. Protect this. |
| Internal vs. external edit tracking | Distinguishing user edits (inside Obsidian) from tool edits (Claude Code, vim, etc.) to avoid false positives. No other Obsidian plugin does this. | **DONE** | Via `markAsInternalEdit` debounce pattern. |
| Incremental re-render | When one file changes, only update that file's section instead of destroying all MergeViews. Preserves scroll position, fold state, and partial chunk reverts for other files. | Med | Current behavior: full re-render on every `addFile` call destroys all sections. This is both a UX issue and a performance issue for multi-file diffs. |
| Setting: internal+external vs external-only tracking | Some users want to see ALL changes (including their own edits, for undo/review). Others only care about external tool changes. Making this configurable expands the user base. | Low | Add a mode enum to settings. External-only is current default behavior. |
| Fold context customization | Let users control how many unchanged lines to show around each diff chunk (margin) and the minimum unchanged region size to fold (minSize). Currently hardcoded to 2 and 4. | Low | Add to settings tab. Values are already parameterized in `computeUnchangedRanges`. |
| Status bar pending diff count | A subtle indicator showing "3 pending diffs" in the status bar so users know changes are waiting even when the diff tab is closed. Obsidian Git shows a similar indicator. | Low | Uses `addStatusBarItem()`. Trivial to implement. |
| Keyboard navigation between chunks | Navigate previous/next chunk with hotkeys (Alt+Up/Down or similar). VS Code has this. Obsidian Git has hunk navigation. Power users expect it. | Low-Med | Requires tracking chunk positions within the MergeView and scrolling to them. |

## Anti-Features

Features to explicitly NOT build. These add complexity without proportional value for this plugin's use case.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Diff history / past diff log | Adds significant storage complexity (compressed archives, retention policies). The Edit History plugin already does this well with `.edtz` files. This plugin's job is to resolve pending changes, not be a version control system. | If users want history, recommend Edit History plugin or Obsidian Git. |
| Inline diff mode (single-column) | Side-by-side is the target UX and matches VS Code mental model. Supporting both modes doubles the UI complexity and testing surface. The Version History Diff plugin already offers line-by-line mode for users who want it. | Stay focused on side-by-side. |
| Mobile support | Desktop-only per manifest. Obsidian mobile has limited CodeMirror support and external file changes don't happen on mobile. | Explicitly document as desktop-only. |
| Git integration | Obsidian Git plugin already handles git diffs, staging, commits. Duplicating this is wasted effort. This plugin detects ANY external change, git or not. | Remain git-agnostic. Complement Obsidian Git, don't compete. |
| Merge conflict resolution | Three-way merge (base/ours/theirs) is a fundamentally different UX from two-way diff. The File Diff plugin already handles Syncthing conflicts. | Two-way diff only. External change vs. snapshot. |
| Color-blind mode in plugin | Obsidian themes and CSS snippets handle accessibility. The Version History Diff plugin has this, but it's because they use a custom diff renderer. CodeMirror MergeView uses CSS classes that theme authors can style. | Document which CSS classes to override for accessibility. |
| Notification popups / toasts | Intrusive. Obsidian users value a calm interface. Auto-opening the diff tab is sufficient notification. | Status bar indicator is the right level of intrusiveness. |
| File type support beyond markdown | Obsidian is a markdown editor. Watching JSON, YAML, or canvas files adds edge cases (binary content, structured data) without serving the core use case. | Keep the `.md` extension filter. If users request it, expand selectively. |

## Feature Dependencies

```
Diff Persistence -----> Correct old/new orientation (must be right before persisting)
                   \--> File exclusions (exclude patterns stored in same settings)

Incremental Re-render --> Diff Persistence (persist state per-file, restore individually)
                     \--> Fold state preservation (fold state survives re-render)

Internal/External Mode --> File exclusions (both are watcher configuration)

Status Bar Indicator --> Diff Persistence (count must survive reload)

Keyboard Navigation --> Incremental Re-render (need stable MergeView references to scroll within)

Fold Customization --> (independent, just settings wiring)
```

## MVP Recommendation

**Immediate priorities (unblock everything else):**

1. **Fix accept/reject side orientation** -- Correctness bug. Must be fixed before any persistence work, otherwise persisted diffs would have swapped content.
2. **Diff persistence across reload** -- Single most important missing feature. Without this, the plugin is fragile. Users who restart Obsidian or have it crash lose all pending changes silently. Use `saveData`/`loadData` to persist the `pendingDiffs` map. Store `{ [path]: { oldContent, newContent } }`. On reload, re-read current file content to see if it still differs from oldContent; if it matches newContent, the diff is still pending. If the file has changed again, update newContent.
3. **File exclusion patterns** -- Table stakes for any file-watching plugin. Without it, noisy vaults generate overwhelming diff counts.

**Next tier (solidify the UX):**

4. **Incremental re-render** -- Stops the jarring full-rebuild behavior. Once persistence is in place, this becomes the main UX improvement.
5. **Internal/external tracking mode** -- Low effort, expands use cases.
6. **Fold context customization** -- Low effort, wiring already exists.
7. **Status bar indicator** -- Low effort, high polish.

**Defer:**

- Keyboard navigation: Quality of life, not blocking.
- Any anti-feature: See above.

## Competitive Landscape Summary

| Plugin | Overlap | Gap This Plugin Fills |
|--------|---------|----------------------|
| [Obsidian Git](https://github.com/Vinzent03/obsidian-git) | Diff view, source control, hunk navigation | Git-specific. Doesn't detect non-git external changes. Requires manual pull. |
| [Version History Diff](https://github.com/kometenstaub/obsidian-version-history-diff) | Side-by-side diff, version comparison | Requires manual browsing. No auto-detection. Uses private APIs (fragile). |
| [File Diff](https://github.com/friebetill/obsidian-file-diff) | File comparison, merge | Manual comparison between two vault files. No external change detection. |
| [Edit History](https://github.com/antoniotejada/obsidian-edit-history) | Change tracking, diff views | Tracks all edits for history/undo. Different purpose (archival vs. resolution). No accept/reject workflow. |
| VS Code diff editor | Side-by-side, per-chunk revert, gutter indicators, keyboard nav | Not in Obsidian. This plugin brings the VS Code diff experience to Obsidian. |
| Cursor/Claude Code diff | Accept/reject inline, AI-generated changes | Only works in their IDEs. This plugin handles the same use case inside Obsidian. |

**This plugin's unique position:** Real-time, automatic external change detection with an interactive resolution workflow, inside Obsidian. No other plugin combines these three things.

## Sources

- [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git) - Diff view, source control features (MEDIUM confidence)
- [Version History Diff plugin](https://github.com/kometenstaub/obsidian-version-history-diff) - Side-by-side/line-by-line diff, version comparison (HIGH confidence)
- [File Diff plugin](https://github.com/friebetill/obsidian-file-diff) - File comparison and merge (MEDIUM confidence)
- [Edit History plugin](https://github.com/antoniotejada/obsidian-edit-history) - Edit tracking, compressed diff storage, persistence patterns (HIGH confidence)
- [VS Code diff editor issues](https://github.com/microsoft/vscode/issues/99659) - Diff persistence limitations in VS Code (MEDIUM confidence)
- [VS Code diff editor scroll persistence issues](https://github.com/Microsoft/vscode/issues/40151) - Scroll position not retained (MEDIUM confidence)
- [CodeMirror MergeView incremental diff issue](https://github.com/codemirror/dev/issues/1106) - Performance with large/divergent files (HIGH confidence)
- [VS Code keyboard revert issue](https://github.com/microsoft/vscode/issues/225879) - Keyboard-based hunk revert (MEDIUM confidence)
- [Obsidian ItemView state management](https://forum.obsidian.md/t/confused-about-the-setviewstate-and-state-management-of-the-itemview-class/66798) - getState/setState persistence patterns (MEDIUM confidence)
- [Obsidian saveData docs](https://docs.obsidian.md/Reference/TypeScript+API/Plugin/saveData) - Plugin data persistence API (HIGH confidence)
- [Obsidian file exclusion patterns](https://obsidian-file-ignore.kkuk.dev/) - .gitignore-style glob patterns in Obsidian ecosystem (MEDIUM confidence)
