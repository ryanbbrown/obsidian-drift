import * as fs from "node:fs/promises";
import * as path from "node:path";
import { browser, $ } from "@wdio/globals";
import { App } from "obsidian";

const TEST_VAULT_DIR = `.e2e_test_vault_${process.pid}`;
const PLUGIN_ID = "obsidian-diff-viewer";

class ObsidianApp {
  /** Removes the test vault directory if it exists from previous test runs. */
  async removeE2eTestVaultIfExists() {
    await fs.rm(TEST_VAULT_DIR, { force: true, recursive: true });
  }

  /** Creates a fresh vault and opens it in Obsidian. */
  async createAndOpenFreshVault() {
    await browser.execute((testVaultDir: string) => {
      const { ipcRenderer } = require("electron");
      const shouldCreateNewVault = true;
      ipcRenderer.sendSync("vault-open", testVaultDir, shouldCreateNewVault);
    }, TEST_VAULT_DIR);

    // Copy the plugin to the vault
    const targetPluginsDir = `${TEST_VAULT_DIR}/.obsidian/plugins/${PLUGIN_ID}/`;
    await fs.mkdir(targetPluginsDir, { recursive: true });
    await fs.copyFile("../manifest.json", `${targetPluginsDir}/manifest.json`);
    await fs.copyFile("../main.js", `${targetPluginsDir}/main.js`);
    await fs.copyFile("../styles.css", `${targetPluginsDir}/styles.css`);

    await this.switchToMainWindow();
    await this.closeModal("Trust vault modal");
  }

  /** Switches browser context to the main Obsidian window. */
  private async switchToMainWindow() {
    await browser.switchWindow("app://obsidian.md/index.html");
  }

  /** Enables the plugin for testing. */
  async activateTargetPluginForTesting() {
    await this.activatePlugin(PLUGIN_ID);
  }

  /** Enables a plugin by ID. */
  private async activatePlugin(pluginId: string) {
    await browser.execute((id: string) => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      app.plugins.setEnable(true);
      app.plugins.enablePlugin(id);
    }, pluginId);
  }

  /** Closes the currently active modal. */
  async closeModal(modalName: string) {
    console.log(`Closing '${modalName}'`);
    await $(".modal-close-button").click();
  }

  /** Creates a new note with optional content, then waits for vault to settle. */
  async createNewNote(content?: string) {
    const newNoteButton = $("aria/New note");
    await newNoteButton.click();

    const noteContent = $(".workspace-leaf.mod-active .cm-contentContainer");
    await noteContent.click();

    if (content) {
      // Use vault.modify instead of editor.setValue — vault.modify triggers
      // vault.on('modify') synchronously while markAsInternalEdit is still
      // active, so the FileWatcher correctly treats it as an internal edit.
      await browser.execute(async (text: string, pluginId: string) => {
        // @ts-expect-error 'app' exists in Obsidian
        declare const app: App;
        const file = app.workspace.getActiveFile()!;
        const plugin = app.plugins.plugins[pluginId] as any;
        plugin.fileWatcher.markAsInternalEdit(file.path);
        await app.vault.modify(file, text);
      }, content, PLUGIN_ID);
    }

    // Let Obsidian settle (editor sync, etc.)
    await browser.pause(1000);
  }

  /** Gets the file path of the currently active note. */
  async getActiveFilePath(): Promise<string> {
    return await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      return app.workspace.getActiveFile()!.path;
    });
  }

  /** Edits a file through Obsidian's editor (internal edit, should not trigger diff). */
  async editFileInternally(filePath: string, content: string) {
    await browser.execute(async (path: string, text: string, pluginId: string) => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      const file = app.vault.getAbstractFileByPath(path)!;
      const plugin = app.plugins.plugins[pluginId] as any;
      plugin.fileWatcher.markAsInternalEdit(path);
      await app.vault.modify(file, text);
    }, filePath, content, PLUGIN_ID);
    await browser.pause(1000);
  }

  /** Writes content directly to a file in the test vault, bypassing Obsidian's editor. */
  async modifyFileExternally(filePath: string, content: string) {
    const fullPath = path.join(TEST_VAULT_DIR, filePath);
    await fs.writeFile(fullPath, content, "utf-8");
  }

  /** Executes the "open diff viewer" command. */
  async openDiffViewer() {
    await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      app.commands.executeCommandById("obsidian-diff-viewer:open-diff-viewer");
    });
  }

  /** Returns all diff section elements currently visible. */
  async getDiffSections() {
    return $$(".diff-view-section");
  }

  /** Waits for the diff view tab to appear. */
  async waitForDiffTab() {
    await $(".diff-view-container").waitForExist({ timeout: 15000 });
  }

  /** Waits for a specific number of diff sections to appear. */
  async waitForDiffSectionCount(count: number) {
    await browser.waitUntil(
      async () => (await this.getDiffSections()).length === count,
      { timeout: 10000, timeoutMsg: `Expected ${count} diff sections` }
    );
  }

  /** Clicks the Accept button for a given diff section index. */
  async clickAccept(sectionIndex: number) {
    const sections = await this.getDiffSections();
    const btn = await sections[sectionIndex]!.$(".diff-view-btn-accept");
    await btn.scrollIntoView();
    await btn.click();
  }

  /** Clicks the Reject button for a given diff section index. */
  async clickReject(sectionIndex: number) {
    const sections = await this.getDiffSections();
    const btn = await sections[sectionIndex]!.$(".diff-view-btn-reject");
    await btn.scrollIntoView();
    await btn.click();
  }

  /** Reads a file's content from the test vault via Node fs. */
  async readFileFromVault(filePath: string): Promise<string> {
    const fullPath = path.join(TEST_VAULT_DIR, filePath);
    return fs.readFile(fullPath, "utf-8");
  }

  /** Closes the active tab/leaf. */
  async closeActiveTab() {
    await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      app.workspace.activeLeaf?.detach();
    });
  }

  /** Closes diff view tabs without clearing pending diffs (for reopen testing). */
  async closeDiffTabsOnly() {
    await browser.execute(() => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      const leaves = app.workspace.getLeavesOfType("external-diff-view");
      for (const leaf of leaves) {
        leaf.detach();
      }
    });
    await browser.pause(500);
  }

  /** Closes all diff view tabs and clears pending diffs in the plugin. */
  async closeDiffTabs() {
    await browser.execute((pluginId: string) => {
      // @ts-expect-error 'app' exists in Obsidian
      declare const app: App;
      const leaves = app.workspace.getLeavesOfType("external-diff-view");
      for (const leaf of leaves) {
        leaf.detach();
      }
      const plugin = app.plugins.plugins[pluginId] as any;
      if (plugin?.pendingDiffs) {
        plugin.pendingDiffs.clear();
      }
    }, PLUGIN_ID);
    await browser.pause(500);
  }
}

export default new ObsidianApp();
