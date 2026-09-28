import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Per-chunk revert", () => {
  it("should allow per-chunk revert via revert controls", async () => {
    // Create content with 8 distinct lines so two separate diff chunks form
    const original = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // Modify first and last lines to create two separate chunks with unchanged lines between
    const modified = [...original];
    modified[0] = "ALPHA";   // chunk 1: line 1 changed
    modified[7] = "THETA";   // chunk 2: line 8 changed
    await ObsidianApp.modifyFileExternally(filePath, modified.join("\n"));
    await ObsidianApp.waitForDiffTab();
    await ObsidianApp.focusDiffTab();

    // Find revert buttons (one per chunk)
    const revertBtns = await $$(".diff-view-revert-btn");
    expect(revertBtns.length).toBeGreaterThanOrEqual(2);

    // Click the first revert button to revert chunk 1 ("ALPHA" -> "alpha")
    await revertBtns[0]!.scrollIntoView();
    await revertBtns[0]!.click();
    await browser.pause(2000);

    // Restore only changes the result draft until Accept is selected.
    const expected = [...original];
    expected[7] = "THETA"; // chunk 2 still has the external change
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe(expected.join("\n"));
    expect(await ObsidianApp.readFileFromVault(filePath)).toBe(modified.join("\n"));

    await $(".diff-view-history-actions [aria-label='Undo']").click();
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe(modified.join("\n"));
    await $(".diff-view-history-actions [aria-label='Redo']").click();
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe(expected.join("\n"));

    await ObsidianApp.clickAccept(0);
    await browser.waitUntil(async () => (await ObsidianApp.readFileFromVault(filePath)) === expected.join("\n"));
  });
});
