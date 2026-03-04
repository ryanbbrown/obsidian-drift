import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Per-chunk revert", () => {
  it("should close diff section when all chunks are reverted", async () => {
    const original = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    const modified = [...original];
    modified[0] = "ALPHA";
    modified[7] = "THETA";
    await ObsidianApp.modifyFileExternally(filePath, modified.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Revert all chunks one by one (re-query after each since MergeView re-renders)
    let btn = (await $$(".diff-view-revert-btn"))[0];
    while (btn) {
      await btn.scrollIntoView();
      await btn.click();
      await browser.pause(500);
      btn = (await $$(".diff-view-revert-btn"))[0];
    }
    await browser.pause(1000);

    // Diff section should auto-close when all changes are reverted
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    // File should be back to original
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(original.join("\n"));
  });
});
