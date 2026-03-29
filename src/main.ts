import {App, MarkdownView, Modal, Plugin, Setting, TAbstractFile, TFile} from "obsidian";
import {EditorView, ViewUpdate} from "@codemirror/view";
import {EditorState, Transaction, Extension} from "@codemirror/state";
import {DEFAULT_SETTINGS, ExternalDiffSettings, ExternalDiffSettingTab} from "./settings";
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

/** Extract the CM6 EditorView from a MarkdownView (internal Obsidian API). */
function getCmEditor(mdView: MarkdownView): EditorView | undefined {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	return (mdView as any).editor?.cm as EditorView | undefined;
}

export default class ExternalDiffPlugin extends Plugin {
	settings: ExternalDiffSettings;
	private pendingDiffs = new Map<string, PendingDiff>();
	private baselines = new Map<string, string>();
	private selfModifyPaths = new Set<string>();
	private pendingEditWarning = new Set<string>();
	private restoredDiffs: PersistedDiffEntry[] = [];
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf));

		// CM6 detection: register updateListener on all editors
		this.registerEditorExtension(this.createDetectionExtension());

		// Fallback: detect changes to files not open in any editor
		this.registerEvent(this.app.vault.on("modify", this.handleModifyFallback));

		// Baseline housekeeping
		this.registerEvent(this.app.vault.on("create", async (file) => {
			if (file instanceof TFile && file.extension === "md") {
				this.baselines.set(file.path, await this.app.vault.read(file));
			}
		}));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (file instanceof TFile) this.baselines.delete(file.path);
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (file instanceof TFile) {
				const content = this.baselines.get(oldPath);
				if (content !== undefined) {
					this.baselines.delete(oldPath);
					this.baselines.set(file.path, content);
				}
			}
		}));

		this.addCommand({
			id: "toggle-external-change-detection",
			name: "Toggle external change detection",
			callback: () => {
				this.settings.enabled = !this.settings.enabled;
				void this.saveSettings();
			},
		});

		this.addCommand({
			id: "open-diff-viewer",
			name: "Open diff viewer",
			callback: () => void this.openDiffTab(),
		});

		this.addSettingTab(new ExternalDiffSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			void this.initializeBaselinesAndRestore();
		});
	}

	onunload() {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		void this.saveData({
			settings: this.settings,
			pendingDiffs: this.serializePendingDiffs(),
		});
	}

	async loadSettings() {
		const data: PersistedData = ((await this.loadData()) as PersistedData | null) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? {});
		this.restoredDiffs = data.pendingDiffs ?? [];
	}

	async saveSettings() {
		await this.saveData({
			settings: this.settings,
			pendingDiffs: this.serializePendingDiffs(),
		});
	}

	/** Initialize baselines and restore persisted diffs after layout is ready. */
	private async initializeBaselinesAndRestore(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		await Promise.all(files.map(async (file) => {
			this.baselines.set(file.path, await this.app.vault.read(file));
		}));
		if (this.restoredDiffs.length > 0) {
			await this.restorePendingDiffs(this.restoredDiffs);
			this.restoredDiffs = [];
			// Obsidian preserves workspace leaves across plugin reload, so the diff
			// tab may already exist but be empty (new DiffView instance, no sections).
			// Repopulate it with the restored diffs.
			const existing = this.getExistingDiffView();
			if (existing && existing.isEmpty()) {
				for (const [path, diff] of this.pendingDiffs) {
					existing.addFile(path, diff);
				}
			}
		}
	}

	/** Mark a path as being modified by the plugin itself (suppresses detection). */
	markAsSelfModify(path: string): void {
		this.selfModifyPaths.add(path);
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
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveData({
				settings: this.settings,
				pendingDiffs: this.serializePendingDiffs(),
			});
		}, 5000);
	}

	/** Restore pending diffs from persisted data, discarding stale entries. */
	private async restorePendingDiffs(entries: PersistedDiffEntry[]): Promise<void> {
		for (const entry of entries) {
			const file = this.app.vault.getAbstractFileByPath(entry.path);
			if (!(file instanceof TFile)) continue;

			const currentContent = await this.app.vault.read(file);
			if (currentContent === entry.oldContent) continue;

			const diff = this.makeDiffCallbacks(entry.path, entry.oldContent, currentContent);
			this.pendingDiffs.set(entry.path, diff);
		}

		if (this.pendingDiffs.size > 0) {
			this.persistState();
		}
	}

	/** Create the CM6 extension that detects external changes via transaction annotations. */
	private createDetectionExtension(): Extension {
		return [
			// Block user edits on files with pending diffs and show a warning modal
			EditorState.transactionFilter.of((tr) => {
				if (!tr.docChanged) return tr;
				if (!this.settings.enabled) return tr;
				if (tr.annotation(Transaction.userEvent) === "set") return tr;

				const path = this.getPathForEditorState(tr.startState);
				if (!path || !this.pendingDiffs.has(path)) return tr;
				if (this.pendingEditWarning.has(path)) return [];

				this.pendingEditWarning.add(path);
				new EditWarningModal(this.app, () => {
					this.pendingEditWarning.delete(path);
					this.pendingDiffs.delete(path);
					this.getExistingDiffView()?.removeFile(path);
					this.persistState();
				}, () => {
					this.pendingEditWarning.delete(path);
				}).open();
				return [];
			}),

			EditorView.updateListener.of((update: ViewUpdate) => {
				if (!update.docChanged) return;
				if (!this.settings.enabled) return;

				const path = this.getPathForEditorView(update.view);
				if (!path) return;

				// Check if this is our own vault.modify
				if (this.selfModifyPaths.has(path)) {
					this.selfModifyPaths.delete(path);
					this.baselines.set(path, update.state.doc.toString());
					return;
				}

				// Obsidian uses userEvent "set" exclusively when syncing external file
				// content into the editor. Detect that specific signal rather than
				// whitelisting all user events — Obsidian dispatches some user actions
				// (e.g. paste) without standard CM6 userEvent annotations.
				const isExternalSync = update.transactions.some(tr =>
					tr.annotation(Transaction.userEvent) === "set"
				);

				if (isExternalSync) {
					const newContent = update.state.doc.toString();
					const oldContent = this.baselines.get(path);
					if (oldContent !== undefined && oldContent !== newContent) {
						this.handleExternalChange(path, oldContent, newContent);
					}
				} else {
					this.baselines.set(path, update.state.doc.toString());
				}
			}),
		];
	}

	/** Resolve an EditorView to the file path it's editing. */
	private getPathForEditorView(view: EditorView): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view as MarkdownView;
			if (getCmEditor(mdView) === view) {
				return mdView.file?.path ?? null;
			}
		}
		return null;
	}

	/** Resolve an EditorState to the file path (for transactionFilter which lacks view access). */
	private getPathForEditorState(state: EditorState): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const mdView = leaf.view as MarkdownView;
			if (getCmEditor(mdView)?.state === state) {
				return mdView.file?.path ?? null;
			}
		}
		return null;
	}

	/** Fallback handler for vault.on('modify') — catches changes to files not open in any editor. */
	private handleModifyFallback = async (file: TAbstractFile): Promise<void> => {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		if (!this.settings.enabled) return;

		// Skip if file is open in an editor (CM6 listener handles it)
		if (this.isFileOpenInEditor(file.path)) return;

		const newContent = await this.app.vault.read(file);
		const oldContent = this.baselines.get(file.path);

		if (oldContent === undefined) {
			this.baselines.set(file.path, newContent);
			return;
		}

		if (oldContent === newContent) return;

		// Check self-modify
		if (this.selfModifyPaths.has(file.path)) {
			this.selfModifyPaths.delete(file.path);
			this.baselines.set(file.path, newContent);
			return;
		}

		this.handleExternalChange(file.path, oldContent, newContent);
	};

	/** Check if a file is currently open in any editor pane. */
	private isFileOpenInEditor(path: string): boolean {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			const view = leaf.view as MarkdownView;
			if (view.file?.path === path) return true;
		}
		return false;
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
			await this.app.workspace.revealLeaf(existing.leaf);
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
				if (file instanceof TFile) {
					const currentContent = await this.app.vault.read(file);
					if (currentContent !== newContent) {
						new ConflictModal(this.app, path, () => {
							this.completeAccept(path, content, file);
						}).open();
						return;
					}
					this.completeAccept(path, content, file);
				}
			},
			onReject: async () => {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const currentContent = await this.app.vault.read(file);
					if (currentContent !== newContent) {
						new ConflictModal(this.app, path, () => {
							this.completeReject(path, oldContent, file);
						}).open();
						return;
					}
					this.completeReject(path, oldContent, file);
				}
			},
			onWrite: (content: string) => {
				this.baselines.set(path, content);
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					this.selfModifyPaths.add(path);
					void this.app.vault.modify(file, content);
				}
				this.persistState();
			},
		};
	}

	/** Complete the accept action after conflict check. */
	private completeAccept(path: string, content: string, file: TFile): void {
		this.pendingDiffs.delete(path);
		this.baselines.set(path, content);
		this.selfModifyPaths.add(path);
		void this.app.vault.modify(file, content);
		this.persistState();
	}

	/** Complete the reject action after conflict check. */
	private completeReject(path: string, oldContent: string, file: TFile): void {
		this.pendingDiffs.delete(path);
		this.selfModifyPaths.add(path);
		void this.app.vault.modify(file, oldContent);
		this.baselines.set(path, oldContent);
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

		void this.openDiffTab().then(view => view.addFile(path, diff));
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

class EditWarningModal extends Modal {
	private onProceed: () => void;
	private onCancel: () => void;
	private resolved = false;

	constructor(app: App, onProceed: () => void, onCancel: () => void) {
		super(app);
		this.onProceed = onProceed;
		this.onCancel = onCancel;
	}

	/** Render the warning with proceed/cancel buttons. */
	onOpen(): void {
		this.modalEl.addClass("diff-edit-warning-modal");
		this.contentEl.createEl("h3", {text: "Pending external changes"});
		this.contentEl.createEl("p", {
			text: "Editing this file will accept all pending external changes. They will no longer be visible in the diff viewer.",
		});
		new Setting(this.contentEl)
			.addButton(btn => btn.setButtonText("Proceed").setCta().onClick(() => {
				this.resolved = true;
				this.close();
				this.onProceed();
			}))
			.addButton(btn => btn.setButtonText("Cancel").onClick(() => {
				this.resolved = true;
				this.close();
				this.onCancel();
			}));
	}

	/** Call cancel callback if modal was closed without clicking a button. */
	onClose(): void {
		if (!this.resolved) this.onCancel();
	}
}

