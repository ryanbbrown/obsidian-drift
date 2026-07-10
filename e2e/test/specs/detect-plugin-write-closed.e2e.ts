import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should NOT open diff tab when a plugin writes a file not open in any editor", async () => {
    // A note that exists in the vault but is never opened in an editor
    await ObsidianApp.createNoteViaApi("closed-note.md", "Closed note content");

    // API write to the closed file (e.g. Obsidian Sync pulling a mobile edit, or lint-all)
    await ObsidianApp.modifyViaVaultApi("closed-note.md", "Closed note content - updated");

    await browser.pause(3000);
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    const content = await ObsidianApp.readFileFromVault("closed-note.md");
    expect(content).toBe("Closed note content - updated");
  });
});
