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

## 5. Focus the diff tab before clicking inside it

The plugin opens the diff tab in the background (`active: false`), and Obsidian hides inactive tab DOM — so WebDriver refuses native clicks on diff-view elements with "element not interactable" even after scrolling. The `Browser.getWindowForTarget` warnings in the log are a red herring (wdio falls back to Web API scrolling). Call `ObsidianApp.focusDiffTab()` before interacting with anything inside the diff view. Also wait for the specific section to exist first: the container can render before its sections.

## 6. Plugin reload leaves deferred views behind

After `disablePlugin()` + `enablePlugin()`, Obsidian preserves the diff leaf but as a deferred placeholder — `leaf.view` is NOT the plugin's view class until the leaf is revealed or explicitly loaded. Any `leaf.view as DiffView` cast silently gets the placeholder. Product code must `instanceof`-check the view and use `await leaf.loadIfDeferred()` before touching it.
