import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Plugin commands", () => {
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
