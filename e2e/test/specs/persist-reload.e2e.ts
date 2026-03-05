import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Persistence", () => {
  it("should persist diffs across plugin reload", async () => {
    await ObsidianApp.createNewNote("Before reload");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "After reload - external");
    await ObsidianApp.waitForDiffTab();

    const sectionsBefore = await ObsidianApp.getDiffSections();
    expect(sectionsBefore.length).toBe(1);

    // Reload plugin (disable + enable triggers onunload save + onload restore)
    await ObsidianApp.reloadPlugin();

    // Restored diffs are in memory; open via command
    await ObsidianApp.openDiffViewer();
    await ObsidianApp.waitForDiffTab();

    const sectionsAfter = await ObsidianApp.getDiffSections();
    expect(sectionsAfter.length).toBe(1);

    // Accept the restored diff and verify content
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);

    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("After reload - external");
  });
});
