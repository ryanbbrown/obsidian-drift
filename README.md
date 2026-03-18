# Drift

An Obsidian plugin that detects when external tools modify your vault files and shows a side-by-side diff view so you can selectively accept or reject each change — without leaving Obsidian.

## Features

- **Automatic detection** — External file changes are detected instantly via CM6 transaction monitoring. No polling or debounce delays.
- **Side-by-side diff view** — See exactly what changed with a CodeMirror MergeView, including syntax highlighting and fold controls for unchanged regions.
- **Per-chunk accept/reject** — Accept or reject individual changes, not just the whole file. Revert buttons on each diff chunk let you cherry-pick.
- **Persistence** — Pending diffs survive Obsidian restarts. Stale diffs (file deleted or reverted) are automatically discarded on reload.
- **Conflict detection** — If a file changes after a diff was generated, the plugin warns you before overwriting.
- **Edit protection** — Editing a file with pending diffs shows a warning modal, preventing accidental data loss.

## Use cases

- Review changes made by external scripts, CLI tools, or sync services
- Inspect modifications from Obsidian Git or other plugins that write to files directly
- Catch unexpected changes from cloud sync (Dropbox, iCloud, Syncthing, etc.)

## Installation

This plugin is currently awaiting approval in the Obsidian community plugin store. In the meantime, you can install it using one of these methods:

### Using BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the community plugin store
2. Open command palette → **BRAT: Add a beta plugin for testing**
3. Enter `ryanbbrown/obsidian-drift`

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ryanbbrown/obsidian-drift/releases)
2. Create a folder `VaultFolder/.obsidian/plugins/drift/`
3. Copy the downloaded files into that folder
4. Restart Obsidian and enable the plugin in **Settings → Community plugins**

## Usage

Once enabled, the plugin runs automatically. When an external tool modifies a markdown file in your vault:

1. A **Drift** tab opens showing the side-by-side diff
2. Use **Accept All** to keep the new content, or **Reject All** to revert to the original
3. Use the **revert button** on individual chunks to selectively undo specific changes
4. Use the **Open diff viewer** command to reopen the tab if you close it

## Commands

| Command | Description |
|---------|-------------|
| **Open diff viewer** | Open or focus the diff viewer tab |
| **Toggle external change detection** | Enable/disable external change detection |
