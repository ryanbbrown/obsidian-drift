import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Detection UX", () => {
  it("should resolve pending diff via warning modal Proceed, then detect new external changes", async () => {
    const original = ["aaa", "bbb", "ccc", "ddd", "eee"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // External edit: remove "bbb"
    const afterExternal = ["aaa", "ccc", "ddd", "eee"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // User edit triggers warning modal
    await ObsidianApp.focusNote(filePath);
    await ObsidianApp.editAsUser(filePath, "whatever");

    // Click Proceed to resolve diff
    await ObsidianApp.clickModalButton("diff-edit-warning-modal", "Proceed");
    await browser.pause(1000);

    // Diff should be removed
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    // Edit via vault.modify (syncs editor + disk) — no modal since diff is resolved
    const afterUserEdit = ["aaa", "ccc", "ddd", "eee", "fff"];
    await ObsidianApp.editFileInternally(filePath, afterUserEdit.join("\n"));

    // No diff should appear for the internal edit
    await browser.pause(2000);
    const containersAfterEdit = await $$(".diff-view-container");
    expect(containersAfterEdit.length).toBe(0);

    // Another external edit should create a new diff relative to post-edit state
    const afterExternal2 = ["aaa", "ccc", "ddd", "eee", "fff", "ggg"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal2.join("\n"));
    await ObsidianApp.waitForDiffTab();

    const diffContent = await ObsidianApp.getMergeViewContent();
    expect(diffContent).not.toBeNull();
    expect(diffContent!.a).toBe(afterUserEdit.join("\n"));
    expect(diffContent!.b).toBe(afterExternal2.join("\n"));
  });
});
