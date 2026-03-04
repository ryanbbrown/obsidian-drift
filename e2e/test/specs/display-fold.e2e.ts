import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Diff display", () => {
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

    // Verify folded regions exist in BOTH editors (collapsed state)
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
});
