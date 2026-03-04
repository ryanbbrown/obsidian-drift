import {Editor, MarkdownView, Modal, Plugin, Setting} from "obsidian";
import {DEFAULT_SETTINGS, ExternalDiffSettings, ExternalDiffSettingTab} from "./settings";
import {FileWatcher} from "./FileWatcher";
import {DiffView, DIFF_VIEW_TYPE, PendingDiff} from "./DiffView";

export default class ExternalDiffPlugin extends Plugin {
	settings: ExternalDiffSettings;
	private fileWatcher: FileWatcher;
	private pendingDiffs = new Map<string, PendingDiff>();

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

		this.app.workspace.onLayoutReady(() => this.fileWatcher.start());
	}

	onunload() {
		this.fileWatcher.destroy();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ExternalDiffSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
			onAccept: (content: string) => {
				this.pendingDiffs.delete(path);
				this.fileWatcher.updateSnapshot(path, content);
				if (content !== newContent) {
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file) {
						this.fileWatcher.markAsInternalEdit(path);
						this.app.vault.modify(file as any, content);
					}
				}
			},
			onReject: () => {
				this.pendingDiffs.delete(path);
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					this.fileWatcher.markAsInternalEdit(path);
					this.app.vault.modify(file as any, oldContent);
				}
				this.fileWatcher.updateSnapshot(path, oldContent);
			},
			onWrite: (content: string) => {
				this.fileWatcher.updateSnapshot(path, content);
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file) {
					this.fileWatcher.markAsInternalEdit(path);
					this.app.vault.modify(file as any, content);
				}
			},
		};
	}

	/** Handle an external file change — add to the single diff tab, opening it only if needed. */
	private handleExternalChange(path: string, oldContent: string, newContent: string): void {
		const diff = this.makeDiffCallbacks(path, oldContent, newContent);
		this.pendingDiffs.set(path, diff);

		const existing = this.getExistingDiffView();
		if (existing) {
			existing.addFile(path, diff);
			return;
		}

		this.openDiffTab().then(view => view.addFile(path, diff));
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
