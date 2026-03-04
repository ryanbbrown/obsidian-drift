import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should open diff tab when a file is modified externally", async () => {
    await ObsidianApp.createNewNote("Hello world");
    const filePath = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath, "Hello world - modified externally");
    await ObsidianApp.waitForDiffTab();

    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(1);
  });
});
