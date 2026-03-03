import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External diff viewer", () => {
  beforeEach(async () => {
    await ObsidianApp.closeDiffTabs();
  });

  it("should open diff tab when a file is modified externally", async () => {
    await ObsidianApp.createNewNote("Hello world");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Hello world - modified externally");
    await ObsidianApp.waitForDiffTab();

    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(1);
  });

  it("should NOT open diff tab for internal edits", async () => {
    // createNewNote uses setValue + markAsInternalEdit, simulating an internal edit.
    // Verify no diff tab opens for that content change.
    await ObsidianApp.createNewNote("Content set internally");

    await browser.pause(3000);
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);
  });

  it("should remove diff section when Accept is clicked", async () => {
    const originalContent = "Before accept";
    const externalContent = "After accept - external change";
    await ObsidianApp.createNewNote(originalContent);
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, externalContent);
    await ObsidianApp.waitForDiffTab();

    const sectionsBefore = await ObsidianApp.getDiffSections();
    expect(sectionsBefore.length).toBe(1);

    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);

    // Diff tab should close (no sections left = tab auto-closes)
    const containersAfter = await $$(".diff-view-container");
    expect(containersAfter.length).toBe(0);

    // TEST-01: Verify vault file contains the NEW (external) content, not the old
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(externalContent);
  });

  it("should revert to old content when Reject is clicked", async () => {
    const originalContent = "Before reject";
    await ObsidianApp.createNewNote(originalContent);
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Rejected external change");
    await ObsidianApp.waitForDiffTab();
    await ObsidianApp.clickReject(0);

    // Wait for Obsidian to write the reverted content
    await browser.pause(2000);
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(originalContent);
  });

  it("should accumulate multiple files in a single diff tab", async () => {
    await ObsidianApp.createNewNote("File one content");
    const filePath1 = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.createNewNote("File two content");
    const filePath2 = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath1, "File one modified");
    await ObsidianApp.modifyFileExternally(filePath2, "File two modified");

    await ObsidianApp.waitForDiffSectionCount(2);
    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(2);
  });

  it("should expand collapsed unchanged lines and re-collapse them", async () => {
    // Create a file with many lines so fold kicks in
    // (margin: 2, minSize: 4 → need ≥4 unchanged lines between changes)
    const lines = Array.from({length: 20}, (_, i) => `line ${i + 1}`);
    await ObsidianApp.createNewNote(lines.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // Modify only the first and last lines externally
    const modified = [...lines];
    modified[0] = "CHANGED line 1";
    modified[19] = "CHANGED line 20";
    await ObsidianApp.modifyFileExternally(filePath, modified.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // TEST-04: Verify folded regions exist in BOTH editors (collapsed state)
    const foldedBeforeA = await $$(".cm-merge-a .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    const foldedBeforeB = await $$(".cm-merge-b .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    expect(foldedBeforeA.length).toBeGreaterThan(0);
    expect(foldedBeforeB.length).toBeGreaterThan(0);
    expect(foldedBeforeA.length).toBe(foldedBeforeB.length);

    // Click a folded region in editor A to expand it
    await foldedBeforeA[0]!.click();
    await browser.pause(500);

    // Verify BOTH editors have one fewer collapsed fold widget (sync)
    const foldedAfterA = await $$(".cm-merge-a .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    const foldedAfterB = await $$(".cm-merge-b .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    expect(foldedAfterA.length).toBeLessThan(foldedBeforeA.length);
    expect(foldedAfterB.length).toBeLessThan(foldedBeforeB.length);
    expect(foldedAfterA.length).toBe(foldedAfterB.length);

    const collapseBars = await $$(".diff-view-fold-expanded");
    expect(collapseBars.length).toBeGreaterThan(0);

    // Click the collapse bar to re-fold
    await collapseBars[0]!.click();
    await browser.pause(500);

    // Verify both editors are folded again
    const foldedRestoredA = await $$(".cm-merge-a .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    const foldedRestoredB = await $$(".cm-merge-b .diff-view-fold-widget:not(.diff-view-fold-expanded)");
    expect(foldedRestoredA.length).toBe(foldedBeforeA.length);
    expect(foldedRestoredB.length).toBe(foldedBeforeB.length);
  });

  it("should accumulate sequential edits to the same file into one diff", async () => {
    const lines = ["line 1", "line 2", "line 3", "line 4", "line 5"];
    await ObsidianApp.createNewNote(lines.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // First external edit: remove line 2
    const afterRemoval = ["line 1", "line 3", "line 4", "line 5"];
    await ObsidianApp.modifyFileExternally(filePath, afterRemoval.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Second external edit: also add a line at the end
    const afterBoth = ["line 1", "line 3", "line 4", "line 5", "line 6"];
    await ObsidianApp.modifyFileExternally(filePath, afterBoth.join("\n"));
    await browser.pause(2000);

    // Should still be one section (same file), showing both changes
    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(1);

    // The diff should show the deletion (line 2) and the addition (line 6).
    // Check that both editors have the right content via the CM editors.
    const diffContent = await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: any;
      const leaves = app.workspace.getLeavesOfType("external-diff-view");
      if (!leaves.length) return null;
      const view = leaves[0].view as any;
      const section = view.sections.values().next().value;
      if (!section?.mergeView) return null;
      return {
        a: section.mergeView.a.state.doc.toString(),
        b: section.mergeView.b.state.doc.toString(),
      };
    });

    expect(diffContent).not.toBeNull();
    // Side A = newContent (latest external edits), Side B = oldContent (original)
    expect(diffContent!.a).toBe(afterBoth.join("\n"));
    expect(diffContent!.b).toBe(lines.join("\n"));

    // TEST-05: Accept and verify vault file has the latest accumulated content
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);
    const vaultContent = await ObsidianApp.readFileFromVault(filePath);
    expect(vaultContent).toBe(afterBoth.join("\n"));
  });

  it("should only track external edits when interleaved with internal edits", async () => {
    const original = ["aaa", "bbb", "ccc", "ddd", "eee"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // External edit: remove "bbb"
    const afterExternal1 = ["aaa", "ccc", "ddd", "eee"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal1.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Accept the diff to reset state
    await ObsidianApp.clickAccept(0);
    await browser.pause(1000);

    // Internal edit: change "ccc" to "CCC"
    const afterInternal = ["aaa", "CCC", "ddd", "eee"];
    await ObsidianApp.editFileInternally(filePath, afterInternal.join("\n"));

    // No diff should appear for the internal edit
    await browser.pause(2000);
    const containersAfterInternal = await $$(".diff-view-container");
    expect(containersAfterInternal.length).toBe(0);

    // External edit: add "fff" at the end
    const afterExternal2 = ["aaa", "CCC", "ddd", "eee", "fff"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal2.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Diff should show only the external change (relative to post-internal state)
    const diffContent = await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: any;
      const leaves = app.workspace.getLeavesOfType("external-diff-view");
      if (!leaves.length) return null;
      const view = leaves[0].view as any;
      const section = view.sections.values().next().value;
      if (!section?.mergeView) return null;
      return {
        a: section.mergeView.a.state.doc.toString(),
        b: section.mergeView.b.state.doc.toString(),
      };
    });

    expect(diffContent).not.toBeNull();
    // Side A = newContent (after second external edit), Side B = oldContent (snapshot baseline)
    expect(diffContent!.a).toBe(afterExternal2.join("\n"));
    expect(diffContent!.b).toBe(afterInternal.join("\n"));
  });

  it("should reopen diff tab with pending diffs via command", async () => {
    await ObsidianApp.createNewNote("Command test content");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Command test - modified");
    await ObsidianApp.waitForDiffTab();

    // Close the diff tab by type (preserves pending diffs in plugin)
    await ObsidianApp.closeDiffTabsOnly();

    // Reopen via command
    await ObsidianApp.openDiffViewer();
    await ObsidianApp.waitForDiffTab();

    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });
});
