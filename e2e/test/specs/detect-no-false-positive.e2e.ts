import ObsidianApp from "../pageobjects/ObsidianApp";

describe("CM6 detection", () => {
  it("should not show diff for internal user edits", async () => {
    await ObsidianApp.createNewNote("No false positive");
    const filePath = await ObsidianApp.getActiveFilePath();

    // Edit through Obsidian's editor (should NOT trigger diff)
    await ObsidianApp.editFileInternally(filePath, "No false positive - edited internally");
    await browser.pause(3000);

    // Verify no diff tab opened
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    // Verify file content on disk matches the edit
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("No false positive - edited internally");
  });
});
