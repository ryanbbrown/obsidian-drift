# E2E Testing Learnings

## 1. Use `vault.modify()` instead of `editor.setValue()` for setting file content

`editor.setValue()` does NOT trigger Obsidian's `editor-change` workspace event. Any plugin logic that depends on `editor-change` (e.g. marking edits as internal) won't fire, causing the FileWatcher to treat the subsequent auto-save as an external change.

Instead, call `vault.modify()` paired with a manual `markAsInternalEdit()`. Since `vault.modify()` triggers `vault.on('modify')` immediately while the internal flag is still active, the FileWatcher correctly treats it as internal.

## 2. Always reset plugin state between tests

Obsidian plugins maintain state across the session. A diff tab or pending diff from one test will leak into the next. Add a `beforeEach` hook that:
- Closes all diff view leaves
- Clears `pendingDiffs` on the plugin instance

## 3. Close leaves by type, not by active leaf

`app.workspace.activeLeaf` is whichever leaf happens to have focus, which may not be the one you expect. Use `app.workspace.getLeavesOfType("view-type")` to find and close specific leaves reliably.

## 4. Scroll elements into view before clicking

Obsidian tab content can overflow. Always call `scrollIntoView()` on buttons/elements before clicking them, or WebDriver will fail with "element not interactable".
