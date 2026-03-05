import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Persistence", () => {
  it("should discard stale diffs on reload", async () => {
    const originalContent = "Stale test original";
    await ObsidianApp.createNewNote(originalContent);
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Stale test - modified");
    await ObsidianApp.waitForDiffTab();

    // Revert the file to original content (simulates external revert while "closed")
    await ObsidianApp.modifyFileExternally(filePath, originalContent);
    await browser.pause(2000);

    // Reload plugin — the persisted diff should be discarded as stale
    // (current content matches oldContent, so no diff needed)
    await ObsidianApp.reloadPlugin();
    await browser.pause(3000);

    // Diff tab should NOT reappear
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);
  });
});
