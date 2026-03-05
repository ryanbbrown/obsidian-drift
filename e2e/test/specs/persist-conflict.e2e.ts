import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Persistence", () => {
  it("should warn on file conflict when accepting", async () => {
    await ObsidianApp.createNewNote("Conflict test original");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Conflict test - external");
    await ObsidianApp.waitForDiffTab();

    // Modify the file internally (suppresses detection, so the diff still shows
    // the old external change while the file on disk has moved on)
    await ObsidianApp.editFileInternally(filePath, "Conflict test - sneaky edit");

    // Click accept — file on disk ("sneaky edit") differs from diff's newContent
    // ("external"), so ConflictModal should appear
    await ObsidianApp.clickAccept(0);
    await browser.pause(1000);

    // Verify conflict modal appears
    const modal = await $(".modal-container");
    await modal.waitForExist({ timeout: 5000 });
    const modalText = await modal.getText();
    expect(modalText).toContain("File has changed");

    // Click Proceed
    const proceedBtn = await modal.$(".mod-cta");
    await proceedBtn.click();
    await browser.pause(2000);

    // Diff should be resolved
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);
  });
});
