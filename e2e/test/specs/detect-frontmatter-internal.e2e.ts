import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should NOT open diff tab for frontmatter changes via the app API", async () => {
    await ObsidianApp.createNewNote("---\nstatus: todo\n---\nBody text");
    const filePath = await ObsidianApp.getActiveFilePath();

    // Property edit through the FileManager API (what Bases and metadata plugins use)
    await ObsidianApp.processFrontMatterInApp(filePath, "status", "done");

    await browser.pause(3000);
    const containers = await $$(".diff-view-container");
    expect(containers.length).toBe(0);

    // The change itself landed on disk
    const content = await ObsidianApp.readFileFromVault(filePath);
    expect(content).toContain("status: done");
  });
});
