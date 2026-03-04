import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Accept functionality", () => {
  it("should remove diff section and keep new content when Accept is clicked", async () => {
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

    // Verify vault file contains the NEW (external) content, not the old
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(externalContent);
  });
});
