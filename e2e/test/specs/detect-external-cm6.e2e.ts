import ObsidianApp from "../pageobjects/ObsidianApp";

describe("CM6 detection", () => {
  it("should detect external change via CM6 transaction", async () => {
    const originalContent = "CM6 detect original";
    const externalContent = "CM6 detect - external change";
    await ObsidianApp.createNewNote(originalContent);
    const filePath = await ObsidianApp.getActiveFilePath();

    // Modify externally while file is open in editor (CM6 path)
    await ObsidianApp.modifyFileExternally(filePath, externalContent);
    await ObsidianApp.waitForDiffTab();

    // Verify diff shows correct content
    const mergeContent = await ObsidianApp.getMergeViewContent();
    expect(mergeContent).not.toBeNull();
    expect(mergeContent!.a).toBe(originalContent);
    expect(mergeContent!.b).toBe(externalContent);

    // Accept and verify
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);

    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(externalContent);
  });
});
