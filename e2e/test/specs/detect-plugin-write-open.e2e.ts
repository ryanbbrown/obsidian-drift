import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should NOT open diff tab when a plugin writes an open file via vault.modify", async () => {
    await ObsidianApp.createNewNote("Original content");
    const filePath = await ObsidianApp.getActiveFilePath();

    // Third-party plugin write to the open file (e.g. Linter's lint-on-save)
    await ObsidianApp.modifyViaVaultApi(filePath, "Original content - linted");

    await browser.pause(3000);
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toBe("Original content - linted");
  });
});
