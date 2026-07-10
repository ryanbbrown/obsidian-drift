import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Persistence", () => {
  it("should apply the diff's content when accepting after an internal edit", async () => {
    await ObsidianApp.createNewNote("Conflict test original");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Conflict test - external");
    await ObsidianApp.waitForDiffTab();

    // Modify the file internally (suppresses detection, so the diff still shows
    // the old external change while the file on disk has moved on)
    await ObsidianApp.editFileInternally(filePath, "Conflict test - sneaky edit");

    // Accept applies the diff's newContent — last write wins. ConflictModal was
    // removed (47641ea) in favor of the editor-level warning for user edits.
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);

    // Diff should be resolved
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    // Disk content is what the diff showed, not the sneaky edit
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("Conflict test - external");
  });
});
