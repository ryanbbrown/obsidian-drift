import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should NOT open diff tab for internal edits", async () => {
    // createNewNote uses vault.modify + markAsInternalEdit, simulating an internal edit.
    // Verify no diff tab opens for that content change.
    await ObsidianApp.createNewNote("Content set internally");

    await browser.pause(3000);
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);
  });
});
