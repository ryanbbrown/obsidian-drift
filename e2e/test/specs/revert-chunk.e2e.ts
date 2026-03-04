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

    // Find revert buttons (one per chunk)
    const revertBtns = await $$(".diff-view-revert-btn");
    expect(revertBtns.length).toBeGreaterThanOrEqual(2);

    // Click the first revert button to revert chunk 1 ("ALPHA" -> "alpha")
    await revertBtns[0]!.scrollIntoView();
    await revertBtns[0]!.click();
    await browser.pause(2000);

    // Revert should write to disk immediately (no accept needed)
    const expected = [...original];
    expected[7] = "THETA"; // chunk 2 still has the external change
    const contentAfterRevert = await ObsidianApp.readFileFromVault(filePath);
    expect(contentAfterRevert).toBe(expected.join("\n"));
  });
});
