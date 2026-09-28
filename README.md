# Drift

A VS Code-style side-by-side diff viewer that lives inside Obsidian. Automatically detects external file changes (including AI coding agents) and shows you a before/after view with per-chunk accept/reject, accept all/reject all, and collapsible unchanged regions.

![Drift demo](demo.gif)

## Features

- **Instant detection** — No polling or delays. Uses CodeMirror 6 transaction monitoring to detect external changes the moment they happen.
- **Editable review drafts** — Restore individual blocks or edit the result manually, with Undo/Redo, before applying the result to the file.
- **Accept all / Reject all** — Bulk actions when you have multiple files with pending diffs.
- **Persistence** — Pending diffs and edited drafts survive Obsidian restarts. Drafts are preserved if the file changes again; obsolete unedited reviews are discarded on reload.
- **Edit protection** — Editing a file with pending diffs shows a warning modal, preventing accidental data loss.
- **Tool-agnostic** — Works with any tool that modifies vault files: AI coding agents, sync services, scripts, other plugins.

## Installation

Install Drift from the [Obsidian community plugin directory](https://community.obsidian.md/plugins/drift).

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ryanbbrown/obsidian-drift/releases)
2. Create a folder `VaultFolder/.obsidian/plugins/drift/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**

### Build and test locally

1. Run `npm ci` in the repository to install the locked dependencies.
2. Run `npm run build` to type-check and generate `main.js`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into your test vault's `.obsidian/plugins/drift/` folder.
4. Disable and re-enable Drift in **Settings → Community plugins** to load the new build.

Repeat steps 2–4 after each change. `npm run dev` rebuilds automatically when source files change; you still need to copy the files and reload the plugin. Generated `main.js` is excluded from Git.

Run `npm run test:review` for draft persistence, history, and conflict checks without launching Obsidian. These tests mock vault operations; interactive scenarios live in `e2e/test/specs/`.

## Usage

Once enabled, the plugin runs automatically. When an external tool modifies a markdown file in your vault:

1. A **Drift** tab opens in the background showing the side-by-side diff
2. Compare **Original** on the left with **Result · Editable** on the right
3. Edit the result or select **Restore original block** (`→`) to copy a block from left to right. These actions change the draft only; the file stays untouched until **Accept**. Use **Undo** / **Redo**, or `Ctrl+Z` / `Ctrl+Shift+Z` (`Cmd` on macOS), to revise your decisions
4. Use the **Open diff viewer** command to reopen the tab if you close it
5. Select **Accept** to save the result, or **Reject** to restore the original. **Accept all** and **Reject all** apply the corresponding action to each pending file

Restoring every block keeps the review open so you can undo or explicitly accept it. Draft text is saved in the plugin's local data and restored after restarting Obsidian. Undo history survives collapsing/reopening views and changing the diff algorithm within the current plugin session; it resets on plugin reload or when starting a comparison against a newer disk version.

If the file changes again while you have an edited draft, Drift keeps the draft and shows **Review latest changes**. Selecting it puts the latest disk version on the left and your draft on the right without writing anything. Review the differences before accepting; **Reject** now keeps that latest comparison baseline. Both Accept and Reject check the disk version before writing, and failed or conflicting files remain open even during bulk actions.

The toolbar centers **Accept all** and **Reject all**, separate from the right-aligned per-file actions. The icons on the left expand or collapse all file sections; hover over them for labels. Collapsing a file keeps its editor and current edits intact.

Enable **Word wrap** in the same settings to wrap long lines in both diff panes. It is off by default and applies immediately to open diff views without reloading the plugin.

When word wrap is off, horizontal scrolling in either pane automatically scrolls the other pane by the same offset. Each file comparison scrolls independently. If one pane has less content, it stops at its own edge without pulling the longer pane back.

A shared horizontal scrollbar stays at the bottom of each visible comparison, outside its vertically scrolling text, so long files can be scrolled horizontally without reaching their last line. It is hidden when word wrap is enabled or neither pane overflows.

Enable **Word-level highlighting** to highlight changed text within lines using CodeMirror's built-in diff algorithm. It is off by default, preserving Drift's line-based patience diff. Switching algorithms can change chunk boundaries and the alignment of repeated lines or moved Markdown sections. Open comparisons rebuild immediately, keeping the draft, selection, and undo history while collapsing unchanged regions. Word wrap works with either algorithm.

With word-level highlighting enabled, turn on **High-contrast word highlighting** to add dark red backgrounds to deleted text and dark green backgrounds to inserted text, both with white lettering. This optional styling applies immediately without rebuilding editors and is off by default.

## Commands

| Command | Description |
|---------|-------------|
| **Open diff viewer** | Open or focus the diff viewer tab |
| **Toggle external change detection** | Enable/disable external change detection |
