import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Review draft", () => {
  it("should persist manual edits across closing and reloading without writing the file", async () => {
    await ObsidianApp.createNewNote("Original text");
    const path = await ObsidianApp.getActiveFilePath();
    await ObsidianApp.modifyFileExternally(path, "External text");
    await ObsidianApp.waitForDiffTab();
    await ObsidianApp.focusDiffTab();

    const editor = $(".cm-merge-b .cm-content");
    await editor.click();
    // Select all within the result editor, then type a review draft.
    await browser.keys(["Control", "a"]);
    await browser.keys("Reviewed text");
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe("Reviewed text");
    expect(await ObsidianApp.readFileFromVault(path)).toBe("External text");

    await ObsidianApp.closeDiffTabsOnly();
    await ObsidianApp.openDiffViewer();
    await ObsidianApp.waitForDiffTab();
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe("Reviewed text");

    await ObsidianApp.reloadPlugin();
    await ObsidianApp.openDiffViewer();
    await ObsidianApp.waitForDiffTab();
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe("Reviewed text");
    expect(await ObsidianApp.readFileFromVault(path)).toBe("External text");

    await ObsidianApp.clickAccept(0);
    await browser.waitUntil(async () => (await ObsidianApp.readFileFromVault(path)) === "Reviewed text");
  });
});
