import {App, Editor, MarkdownView, Modal, Plugin, Setting, TFile} from "obsidian";
import {DEFAULT_SETTINGS, ExternalDiffSettings, ExternalDiffSettingTab} from "./settings";
import {FileWatcher} from "./FileWatcher";
import {DiffView, DIFF_VIEW_TYPE, PendingDiff} from "./DiffView";

interface PersistedDiffEntry {
	path: string;
	oldContent: string;
	newContent: string;
}

interface PersistedData {
	settings?: Partial<ExternalDiffSettings>;
	pendingDiffs?: PersistedDiffEntry[];
}

export default class ExternalDiffPlugin extends Plugin {
	settings: ExternalDiffSettings;
	private fileWatcher: FileWatcher;
	private pendingDiffs = new Map<string, PendingDiff>();
	private restoredDiffs: PersistedDiffEntry[] = [];
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();

		this.fileWatcher = new FileWatcher(
			this.app,
			this.settings,
			(path, oldContent, newContent) => this.handleExternalChange(path, oldContent, newContent),
		);

		this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf));

		this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
			if (info instanceof MarkdownView && info.file) {
				this.fileWatcher.markAsInternalEdit(info.file.path);
			}
		}));

		this.registerEvent(this.app.vault.on("modify", this.fileWatcher.handleModify));
		this.registerEvent(this.app.vault.on("create", this.fileWatcher.handleCreate));
		this.registerEvent(this.app.vault.on("delete", this.fileWatcher.handleDelete));
		this.registerEvent(this.app.vault.on("rename", this.fileWatcher.handleRename));

		this.addCommand({
			id: "toggle-external-change-detection",
			name: "Toggle external change detection",
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				this.saveSettings();
			},
		});

		this.addCommand({
			id: "open-diff-viewer",
			name: "Open diff viewer",
			callback: () => this.openDiffTab(),
		});

		this.addCommand({
			id: "test-simulate-insert",
			name: "Test: Simulate external insert",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view.file) return;
				new TextInputModal(this.app, "Text to insert", (text) => {
					if (!view.file) return;
					const oldContent = editor.getValue();
					const line = editor.getCursor().line;
					const lines = oldContent.split("\n");
					lines.splice(line + 1, 0, text);
					const newContent = lines.join("\n");
					this.fileWatcher.markAsInternalEdit(view.file.path);
					this.app.vault.modify(view.file, newContent);
					this.handleExternalChange(view.file.path, oldContent, newContent);
				}).open();
			},
		});

		this.addCommand({
			id: "test-simulate-delete",
			name: "Test: Simulate external delete",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view.file) return;
				const oldContent = editor.getValue();
				const selection = editor.getSelection();
				let newContent: string;
				if (selection.length > 0) {
					const from = editor.posToOffset(editor.getCursor("from"));
					const to = editor.posToOffset(editor.getCursor("to"));
					newContent = oldContent.slice(0, from) + oldContent.slice(to);
				} else {
					const lines = oldContent.split("\n");
					lines.splice(editor.getCursor().line, 1);
					newContent = lines.join("\n");
				}
				this.fileWatcher.markAsInternalEdit(view.file.path);
				this.app.vault.modify(view.file, newContent);
				this.handleExternalChange(view.file.path, oldContent, newContent);
			},
		});

		this.addSettingTab(new ExternalDiffSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(async () => {
			await this.fileWatcher.start();
			if (this.restoredDiffs.length > 0) {
				await this.restorePendingDiffs(this.restoredDiffs);
				this.restoredDiffs = [];
			}
		});
	}

	onunload() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		this.saveData({
			settings: this.settings,
			pendingDiffs: this.serializePendingDiffs(),
		});
		this.fileWatcher.destroy();
	}

	async loadSettings() {
		const data: PersistedData = (await this.loadData()) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? {});
		this.restoredDiffs = data.pendingDiffs ?? [];
	}

	async saveSettings() {
		await this.saveData({
			settings: this.settings,
			pendingDiffs: this.serializePendingDiffs(),
		});
	}

	/** Serialize pending diffs to a persistable format. */
	private serializePendingDiffs(): PersistedDiffEntry[] {
		return Array.from(this.pendingDiffs.entries()).map(([path, diff]) => ({
			path,
			oldContent: diff.oldContent,
			newContent: diff.newContent,
		}));
	}

	/** Schedule a debounced save of state to disk. */
	private persistState(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(async () => {
			this.saveTimer = null;
			await this.saveData({
				settings: this.settings,
				pendingDiffs: this.serializePendingDiffs(),
			});
		}, 5000);
	}

	/** Restore pending diffs from persisted data, discarding stale entries. */
	private async restorePendingDiffs(entries: PersistedDiffEntry[]): Promise<void> {
		for (const entry of entries) {
			const file = this.app.vault.getAbstractFileByPath(entry.path);
			if (!file) continue;

			const currentContent = await this.app.vault.read(file as TFile);
			if (currentContent === entry.oldContent) continue;

			const diff = this.makeDiffCallbacks(entry.path, entry.oldContent, currentContent);
			this.pendingDiffs.set(entry.path, diff);
		}

		if (this.pendingDiffs.size > 0) {
			this.persistState();
		}
	}

	/** Find the existing diff view, or null if none open. */
	private getExistingDiffView(): DiffView | null {
		const leaves = this.app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
		return leaves.length > 0 ? (leaves[0]!.view as DiffView) : null;
	}

	/** Open or focus the diff tab, populating it with all pending diffs. */
	private async openDiffTab(): Promise<DiffView> {
		const existing = this.getExistingDiffView();
		if (existing) {
			this.app.workspace.revealLeaf(existing.leaf);
			return existing;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({type: DIFF_VIEW_TYPE, active: true});
		const view = leaf.view as DiffView;
		// Repopulate from stored pending diffs
		for (const [path, diff] of this.pendingDiffs) {
			view.addFile(path, diff);
		}
		return view;
	}

	/** Create callbacks for a pending diff and store them. */
	private makeDiffCallbacks(path: string, oldContent: string, newContent: string): PendingDiff {
		return {
			oldContent,
			newContent,
			onAccept: async (content: string) => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					const currentContent = await this.app.vault.read(file as TFile);
					if (currentContent !== newContent) {
						new ConflictModal(this.app, path, () => {
							this.completeAccept(path, content, file as TFile);
						}).open();
						return;
					}
				}
				this.completeAccept(path, content, file as TFile);
			},
			onReject: async () => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					const currentContent = await this.app.vault.read(file as TFile);
					if (currentContent !== newContent) {
						new ConflictModal(this.app, path, () => {
							this.completeReject(path, oldContent, file as TFile);
						}).open();
						return;
					}
				}
				this.completeReject(path, oldContent, file as TFile);
			},
			onWrite: (content: string) => {
				this.fileWatcher.updateSnapshot(path, content);
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					this.fileWatcher.markAsInternalEdit(path);
					this.app.vault.modify(file as any, content);
				}
				this.persistState();
			},
		};
	}

	/** Complete the accept action after conflict check. */
	private completeAccept(path: string, content: string, file: TFile): void {
		this.pendingDiffs.delete(path);
		this.fileWatcher.updateSnapshot(path, content);
		this.fileWatcher.markAsInternalEdit(path);
		this.app.vault.modify(file, content);
		this.persistState();
	}

	/** Complete the reject action after conflict check. */
	private completeReject(path: string, oldContent: string, file: TFile): void {
		this.pendingDiffs.delete(path);
		this.fileWatcher.markAsInternalEdit(path);
		this.app.vault.modify(file, oldContent);
		this.fileWatcher.updateSnapshot(path, oldContent);
		this.persistState();
	}

	/** Handle an external file change — add to the single diff tab, opening it only if needed. */
	private handleExternalChange(path: string, oldContent: string, newContent: string): void {
		const diff = this.makeDiffCallbacks(path, oldContent, newContent);
		this.pendingDiffs.set(path, diff);
		this.persistState();

		const existing = this.getExistingDiffView();
		if (existing) {
			existing.addFile(path, diff);
			return;
		}

		this.openDiffTab().then(view => view.addFile(path, diff));
	}
}

class ConflictModal extends Modal {
	private onProceed: () => void;

	constructor(app: App, path: string, onProceed: () => void) {
		super(app);
		this.onProceed = onProceed;
	}

	/** Render the conflict warning with proceed/cancel buttons. */
	onOpen(): void {
		this.contentEl.createEl("h3", {text: "File has changed"});
		this.contentEl.createEl("p", {
			text: "This file was modified since the diff was generated. Proceeding will overwrite those changes.",
		});
		new Setting(this.contentEl)
			.addButton(btn => btn.setButtonText("Proceed").setCta().onClick(() => {
				this.close();
				this.onProceed();
			}))
			.addButton(btn => btn.setButtonText("Cancel").onClick(() => this.close()));
	}
}

class TextInputModal extends Modal {
	private prompt: string;
	private onSubmit: (text: string) => void;

	constructor(app: import("obsidian").App, prompt: string, onSubmit: (text: string) => void) {
		super(app);
		this.prompt = prompt;
		this.onSubmit = onSubmit;
	}

	/** Render the modal with a text input and submit button. */
	onOpen(): void {
		let value = "";
		new Setting(this.contentEl)
			.setName(this.prompt)
			.addText(text => {
				text.setPlaceholder("Enter text…");
				text.onChange(v => value = v);
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						this.close();
						this.onSubmit(value);
					}
				});
				// Auto-focus
				setTimeout(() => text.inputEl.focus(), 10);
			});
		new Setting(this.contentEl)
			.addButton(btn => btn.setButtonText("Insert").setCta().onClick(() => {
				this.close();
				this.onSubmit(value);
			}));
	}
}
