# Obsidian Diff Viewer

## What This Is

An Obsidian plugin that auto-detects external file changes (e.g. from Claude Code or other editors), opens a VS Code-style side-by-side diff view with per-chunk accept/reject controls, and lets the user resolve changes inline. Desktop only.

## Core Value

When external tools modify vault files, the user can immediately see exactly what changed and selectively accept or reject each change — without leaving Obsidian.

## Requirements

### Validated

- ✓ External change detection via FileWatcher with snapshot comparison — existing
- ✓ Side-by-side diff view using CodeMirror MergeView with patience diff — existing
- ✓ Per-chunk accept/reject via revertControls — existing
- ✓ Per-file accept/reject buttons — existing
- ✓ Auto-open diff view on external change detection — existing
- ✓ Fold/collapse unchanged regions with synchronized expand — existing
- ✓ Internal edit tracking to avoid false positives — existing

### Active

- [ ] E2e tests confirming all current functionality works correctly
- [ ] Fix accept/reject side-swap (uncommitted DiffView.ts changes)
- [ ] Diff persistence across Obsidian reloads
- [ ] Setting: internal+external vs external-only change tracking
- [ ] Folder/file pattern exclusions for watched files
- [ ] Fold context customization (margin/minSize as settings)
- [ ] Use vault.read() instead of cachedRead() for initial snapshots
- [ ] Incremental re-render (don't destroy all MergeViews when one file changes)
- [ ] Remove test simulation commands from production builds (last step)

### Out of Scope

- Diff history / past diff log — not needed now, adds storage complexity
- Inline diff mode (single-column) — side-by-side is the target UX
- Mobile support — desktop only per manifest
- Keyboard shortcuts for chunk navigation — quality of life, not priority
- Notification badges for pending diffs — quality of life, not priority

## Context

- Plugin is a work-in-progress with core functionality built but not fully hardened
- Recent fix swapped old/new content sides in MergeView — not yet committed or tested
- E2e tests exist (WebdriverIO + Mocha) but have shown inconsistency where tests pass but functionality doesn't always work in practice
- Diffs are currently ephemeral — stored only in memory via pendingDiffs Map, lost on reload
- FileWatcher snapshots all markdown files on load using cachedRead(), which can return stale content
- Full re-render on every file change destroys all MergeView instances (scroll position, fold state lost)

## Constraints

- **Tech stack**: Obsidian plugin API + CodeMirror 6 (CM packages provided by Obsidian, not bundled)
- **Build**: TypeScript + esbuild, output is single main.js
- **Testing**: E2e via WebdriverIO against running Obsidian.app instance
- **Compatibility**: Obsidian >= 0.15.0, desktop only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Patience diff algorithm | Better alignment for markdown/text content than Myers diff | ✓ Good |
| CodeMirror MergeView for diff UI | Matches VS Code UX, Obsidian already ships CM6 | ✓ Good |
| Custom fold system over CM6 built-in | Needed per-region expand/collapse with sync across both editors | ✓ Good |
| Test hardening before new features | Existing functionality needs verification before building on top | — Pending |
| Dedicated diff storage for persistence | In-memory pendingDiffs lost on reload, need structured storage | — Pending |

---
*Last updated: 2026-03-03 after initialization*
