import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should resolve a pending diff when an internal write lands on the same file", async () => {
    await ObsidianApp.createNewNote("Line one");
    const filePath = await ObsidianApp.getActiveFilePath();

    // External change creates a pending diff
    await ObsidianApp.modifyFileExternally(filePath, "Line one - external");
    await ObsidianApp.waitForDiffTab();

    // An internal API write lands on top (e.g. Obsidian Sync merging a phone
    // edit). It builds on the on-disk content, implicitly accepting the
    // external change — the stale diff must not survive, or rejecting it
    // would clobber this write.
    await ObsidianApp.modifyViaVaultApi(filePath, "Line one - external\nphone edit");

    // Diff resolves without user action…
    await browser.waitUntil(
      async () => (await ObsidianApp.getDiffSections()).length === 0,
      { timeout: 5000, timeoutMsg: "Pending diff did not auto-resolve after internal write" }
    );

    // …and the internal write survives on disk
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("Line one - external\nphone edit");
  });
});
