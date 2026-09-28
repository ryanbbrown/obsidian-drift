import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Per-chunk revert", () => {
  it("should keep fully reverted drafts open until accepted", async () => {
    const original = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    const modified = [...original];
    modified[0] = "ALPHA";
    modified[7] = "THETA";
    await ObsidianApp.modifyFileExternally(filePath, modified.join("\n"));
    await ObsidianApp.waitForDiffTab();
    await ObsidianApp.focusDiffTab();

    // Revert all chunks one by one (re-query after each since MergeView re-renders)
    let btn = (await $$(".diff-view-revert-btn"))[0];
    while (btn) {
      await btn.scrollIntoView();
      await btn.click();
      await browser.pause(500);
      btn = (await $$(".diff-view-revert-btn"))[0];
    }
    await browser.pause(1000);

    // Keep the result available for undo or an explicit Accept.
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(1);
    expect((await ObsidianApp.getMergeViewContent())?.b).toBe(original.join("\n"));
    expect(await ObsidianApp.readFileFromVault(filePath)).toBe(modified.join("\n"));

    await ObsidianApp.clickAccept(0);
    await browser.waitUntil(async () => (await ObsidianApp.readFileFromVault(filePath)) === original.join("\n"));

    // File should be back to original
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe(original.join("\n"));
  });
});
