import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Diff display", () => {
  it("should accumulate sequential edits to the same file into one diff", async () => {
    const lines = ["line 1", "line 2", "line 3", "line 4", "line 5"];
    await ObsidianApp.createNewNote(lines.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // First external edit: remove line 2
    const afterRemoval = ["line 1", "line 3", "line 4", "line 5"];
    await ObsidianApp.modifyFileExternally(filePath, afterRemoval.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Second external edit: also add a line at the end
    const afterBoth = ["line 1", "line 3", "line 4", "line 5", "line 6"];
    await ObsidianApp.modifyFileExternally(filePath, afterBoth.join("\n"));
    await browser.pause(2000);

    // Should still be one section (same file), showing both changes
    const sections = await ObsidianApp.getDiffSections();
    expect(sections.length).toBe(1);

    // The diff should show the deletion (line 2) and the addition (line 6).
    const diffContent = await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: any;
      const leaves = app.workspace.getLeavesOfType("external-diff-view");
      if (!leaves.length) return null;
      const view = leaves[0].view as any;
      const section = view.sections.values().next().value;
      if (!section?.mergeView) return null;
      return {
        a: section.mergeView.a.state.doc.toString(),
        b: section.mergeView.b.state.doc.toString(),
      };
    });

    expect(diffContent).not.toBeNull();
    // Side A = oldContent (original), Side B = newContent (latest external edits)
    expect(diffContent!.a).toBe(lines.join("\n"));
    expect(diffContent!.b).toBe(afterBoth.join("\n"));

    // Accept and verify vault file has the latest accumulated content
    await ObsidianApp.clickAccept(0);
    await browser.pause(2000);
    const vaultContent = await ObsidianApp.readFileFromVault(filePath);
    expect(vaultContent).toBe(afterBoth.join("\n"));
  });
});
