import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Detection UX", () => {
  it("should show warning modal on user edit, allow Cancel to keep diff, then Proceed to resolve", async () => {
    await ObsidianApp.createNewNote("original content");
    const filePath = await ObsidianApp.getActiveFilePath();

    // External edit triggers diff
    await ObsidianApp.modifyFileExternally(filePath, "externally modified");
    await ObsidianApp.waitForDiffTab();

    // User edit triggers warning modal
    await ObsidianApp.focusNote(filePath);
    await ObsidianApp.editAsUser(filePath, "user edit attempt");

    // Verify modal is visible
    const modalVisible = await ObsidianApp.isModalVisible("diff-edit-warning-modal");
    expect(modalVisible).toBe(true);

    // Click Cancel — diff should remain
    await ObsidianApp.clickModalButton("diff-edit-warning-modal", "Cancel");
    await browser.pause(500);

    const sectionsAfterCancel = await ObsidianApp.getDiffSections();
    expect(sectionsAfterCancel.length).toBe(1);

    const diffContent = await ObsidianApp.getMergeViewContent();
    expect(diffContent).not.toBeNull();
    expect(diffContent!.a).toBe("original content");
    expect(diffContent!.b).toBe("externally modified");

    // Try editing again — modal should reappear
    await ObsidianApp.focusNote(filePath);
    await ObsidianApp.editAsUser(filePath, "user edit second attempt");
    const modalVisible2 = await ObsidianApp.isModalVisible("diff-edit-warning-modal");
    expect(modalVisible2).toBe(true);

    // Click Proceed — diff should resolve
    await ObsidianApp.clickModalButton("diff-edit-warning-modal", "Proceed");
    await browser.pause(1000);

    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);
  });
});
