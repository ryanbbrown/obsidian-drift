import ObsidianApp from "../pageobjects/ObsidianApp";

describe("External change detection", () => {
  it("should only track external edits when interleaved with internal edits", async () => {
    const original = ["aaa", "bbb", "ccc", "ddd", "eee"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // External edit: remove "bbb"
    const afterExternal1 = ["aaa", "ccc", "ddd", "eee"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal1.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Accept the diff to reset state
    await ObsidianApp.clickAccept(0);
    await browser.pause(1000);

    // Internal edit: change "ccc" to "CCC"
    const afterInternal = ["aaa", "CCC", "ddd", "eee"];
    await ObsidianApp.editFileInternally(filePath, afterInternal.join("\n"));

    // No diff should appear for the internal edit
    await browser.pause(2000);
    const containersAfterInternal = await $$(".diff-view-container");
    expect(containersAfterInternal.length).toBe(0);

    // External edit: add "fff" at the end
    const afterExternal2 = ["aaa", "CCC", "ddd", "eee", "fff"];
    await ObsidianApp.modifyFileExternally(filePath, afterExternal2.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Diff should show only the external change (relative to post-internal state)
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
    // Side A = oldContent (snapshot baseline), Side B = newContent (after second external edit)
    expect(diffContent!.a).toBe(afterInternal.join("\n"));
    expect(diffContent!.b).toBe(afterExternal2.join("\n"));
  });
});
