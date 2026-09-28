import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Persistence", () => {
  it("should preserve newer disk content until the latest version is reviewed", async () => {
    await ObsidianApp.createNewNote("Conflict test original");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Conflict test - external");
    await ObsidianApp.waitForDiffTab();

    // Modify the file internally (suppresses detection, so the diff still shows
    // the old external change while the file on disk has moved on)
    await ObsidianApp.editFileInternally(filePath, "Conflict test - sneaky edit");

    // Accept must not overwrite a disk version the user has not reviewed.
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);

    // The draft remains available and the file stays untouched.
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(1);

    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("Conflict test - sneaky edit");

    await $(".diff-view-review-status button").click();
    await browser.waitUntil(async () => (await ObsidianApp.getMergeViewContent())?.a === "Conflict test - sneaky edit");
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe("Conflict test - external");
    await ObsidianApp.clickAccept(0);
    await browser.waitUntil(async () => (await ObsidianApp.readFileFromVault(filePath)) === "Conflict test - external");
  });
});
