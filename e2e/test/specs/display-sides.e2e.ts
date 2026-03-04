import ObsidianApp from "../pageobjects/ObsidianApp";

describe("Diff display", () => {
  it("should show deletions on the left and additions on the right", async () => {
    const original = ["aaa", "bbb", "ccc", "ddd", "eee"];
    await ObsidianApp.createNewNote(original.join("\n"));
    const filePath = await ObsidianApp.getActiveFilePath();

    // Delete "bbb" and add "fff" — creates a deletion and an addition
    const modified = ["aaa", "ccc", "ddd", "eee", "fff"];
    await ObsidianApp.modifyFileExternally(filePath, modified.join("\n"));
    await ObsidianApp.waitForDiffTab();

    // Inspect highlighted lines on each side
    const highlights = await browser.execute(() => {
      const getHighlightedText = (side: string) => {
        const editor = document.querySelector(`.cm-merge-${side}`);
        if (!editor) return [];
        const lines = editor.querySelectorAll(".cm-line.cm-changedLine");
        return Array.from(lines).map(el => el.textContent?.trim()).filter(Boolean);
      };
      return { a: getHighlightedText("a"), b: getHighlightedText("b") };
    });

    // Left (Side A = old): should highlight "bbb" (deleted from new)
    expect(highlights.a).toContain("bbb");
    expect(highlights.a).not.toContain("fff");

    // Right (Side B = new): should highlight "fff" (added, not in old)
    expect(highlights.b).toContain("fff");
    expect(highlights.b).not.toContain("bbb");
  });
});
