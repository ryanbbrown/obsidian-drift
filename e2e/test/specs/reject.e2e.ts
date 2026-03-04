import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Reject functionality", () => {
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
});
