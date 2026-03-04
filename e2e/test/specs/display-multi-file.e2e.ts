import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Diff display", () => {
  it("should accumulate multiple files in a single diff tab", async () => {
    await ObsidianApp.createNewNote("File one content");
    const filePath1 = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.createNewNote("File two content");
    const filePath2 = await ObsidianApp.getActiveFilePath();

    await ObsidianApp.modifyFileExternally(filePath1, "File one modified");
    await ObsidianApp.modifyFileExternally(filePath2, "File two modified");

    await ObsidianApp.waitForDiffSectionCount(2);
    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(2);
  });
});
