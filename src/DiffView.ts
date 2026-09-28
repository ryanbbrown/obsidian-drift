import {ItemView, WorkspaceLeaf} from "obsidian";
import {Change, MergeView} from "@codemirror/merge";
import {drawSelection, EditorView, keymap, lineNumbers} from "@codemirror/view";
import {defaultKeymap, history, historyField, historyKeymap} from "@codemirror/commands";
import {Compartment, EditorState} from "@codemirror/state";
import type {ExternalDiffSettings} from "./settings";
import {DiffToolbar} from "./diffToolbar";
import {DiffScrollbar} from "./diffScrollbar";
import {ReviewControls} from "./reviewControls";
import type {ReviewSnapshot} from "./reviewDraft";
import {createHorizontalScrollSync, synchronizedScroll} from "./syncScroll";
import {patienceDiff} from "./patienceDiff";
import {foldUnchangedExtension, computeUnchangedRanges, setFoldRanges, toggleFold} from "./foldUnchanged";

/** Line-based diff using patience algorithm, converted to CodeMirror Change[] with character offsets. */
function lineDiff(a: string, b: string): readonly Change[] {
	const aLines = a.split("\n");
	const bLines = b.split("\n");
	const diff = patienceDiff(aLines, bLines);

	const changes: Change[] = [];
	let curA = 0, curB = 0;
	let i = 0;
	while (i < diff.lines.length) {
		const entry = diff.lines[i]!;
		if (entry.aIndex >= 0 && entry.bIndex >= 0) {
			// Matched line — advance both positions
			const sep = entry.aIndex < aLines.length - 1 ? 1 : 0;
			curA += entry.line.length + sep;
			curB += entry.line.length + (entry.bIndex < bLines.length - 1 ? 1 : 0);
			i++;
			continue;
		}
		// Accumulate consecutive deletions/insertions into one Change
		const fromA = curA, fromB = curB;
		while (i < diff.lines.length) {
			const e = diff.lines[i]!;
			if (e.aIndex >= 0 && e.bIndex >= 0) break;
			if (e.bIndex === -1) {
				curA += e.line.length + (e.aIndex < aLines.length - 1 ? 1 : 0);
			} else {
				curB += e.line.length + (e.bIndex < bLines.length - 1 ? 1 : 0);
			}
			i++;
		}
		changes.push(new Change(fromA, curA, fromB, curB));
	}
	return changes;
}

export const DIFF_VIEW_TYPE = "external-diff-view";

export interface PendingDiff extends ReviewSnapshot {
	/** Session-only history and selection; only the draft text is persisted. */
	editorState?: EditorState;
	onAccept: (content: string) => Promise<boolean>;
	onReject: () => Promise<boolean>;
	onDraftChange: (content: string) => void;
	onReviewLatest: () => Promise<void>;
}

interface FileSection {
	diff: PendingDiff;
	expanded: boolean;
	mergeView: MergeView | null;
	mergeContainer: HTMLElement | null;
	chevron?: HTMLElement;
	scrollbar?: DiffScrollbar;
	reviewControls?: ReviewControls;
}

export class DiffView extends ItemView {
	private sections = new Map<string, FileSection>();
	private lineWrapping = new Compartment();
	private wordLevelHighlighting: boolean;
	private toolbar: DiffToolbar | null = null;
	private applying = new Set<string>();

	constructor(leaf: WorkspaceLeaf, private settings: ExternalDiffSettings) {
		super(leaf);
		this.wordLevelHighlighting = settings.wordLevelHighlighting;
	}

	/** Rebuild diffs only when the algorithm changes; preserve current content. */
	updateSettings(): void {
		this.updateContrast();
		const algorithmChanged = this.wordLevelHighlighting !== this.settings.wordLevelHighlighting;
		this.wordLevelHighlighting = this.settings.wordLevelHighlighting;
		for (const [path, section] of this.sections) {
			if (!section.mergeView) continue;
			if (algorithmChanged) {
				this.createMergeView(path, section);
				continue;
			}
			for (const editor of [section.mergeView.a, section.mergeView.b]) {
				if (editor.lineWrapping === this.settings.wordWrap) continue;
				editor.dispatch({
					effects: this.lineWrapping.reconfigure(this.settings.wordWrap ? EditorView.lineWrapping : []),
				});
			}
			section.scrollbar?.refresh();
		}
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
	}

	private updateContrast(): void {
		this.containerEl.classList.toggle("diff-view-contrast",
			this.settings.wordLevelHighlighting && this.settings.contrastChangedText);
	}

	getDisplayText(): string {
		const count = this.sections.size;
		return count ? `Diffs (${count})` : "External Diffs";
	}

	getIcon(): string {
		return "git-compare";
	}

	/** Check if the view has no file sections. */
	isEmpty(): boolean {
		return this.sections.size === 0;
	}

	/** Add or update a file's diff. */
	addFile(path: string, diff: PendingDiff): void {
		const previous = this.sections.get(path);
		if (previous) this.destroyMergeView(previous);
		this.sections.set(path, {diff, expanded: true, mergeView: null, mergeContainer: null});
		this.render();
	}

	updateReviewStatus(path: string): void {
		const section = this.sections.get(path);
		if (section) section.reviewControls?.update(section.diff.conflicted);
	}

	async onOpen(): Promise<void> {}

	onClose(): Promise<void> {
		for (const section of this.sections.values()) {
			this.destroyMergeView(section);
		}
		this.sections.clear();
		return Promise.resolve();
	}

	private render(): void {
		if (this.toolbar) this.removeChild(this.toolbar);
		this.toolbar = null;
		this.updateContrast();
		for (const section of this.sections.values()) {
			this.destroyMergeView(section);
			section.mergeView = null;
			section.mergeContainer = null;
		}

		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("diff-view-container");

		if (this.sections.size === 0) {
			container.createDiv({cls: "diff-view-empty", text: "No pending changes."});
			return;
		}

		this.toolbar = this.addChild(new DiffToolbar(container, this.sections.size > 1,
			value => {
				for (const [path, section] of this.sections) this.setExpanded(path, section, value);
			}, () => { void this.handleAcceptAll(); }, () => { void this.handleRejectAll(); }));

		const scrollArea = container.createDiv({cls: "diff-view-scroll"});

		for (const [path, section] of this.sections) {
			const block = scrollArea.createDiv({cls: "diff-view-section"});

			// Collapsible header
			const header = block.createDiv({cls: "diff-view-section-header"});

			const left = header.createDiv({cls: "diff-view-section-left"});
			section.chevron = left.createSpan({cls: `diff-view-chevron ${section.expanded ? "is-expanded" : ""}`, text: "›"});
			left.createSpan({cls: "diff-view-filepath", text: path});
			left.addEventListener("click", () => {
				this.setExpanded(path, section, !section.expanded);
			});

			const actions = header.createDiv({cls: "diff-view-actions"});
			const acceptBtn = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-accept", text: "Accept"});
			const rejectBtn = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-reject", text: "Reject"});

			acceptBtn.addEventListener("click", (e) => { e.stopPropagation(); void this.handleAccept(path); });
			rejectBtn.addEventListener("click", (e) => { e.stopPropagation(); void this.handleReject(path); });

			section.mergeContainer = block.createDiv({cls: "diff-view-merge cm-s-obsidian mod-cm6"});
			this.setExpanded(path, section, section.expanded);
		}
	}

	private setExpanded(path: string, section: FileSection, expanded: boolean): void {
		section.expanded = expanded;
		section.chevron?.classList.toggle("is-expanded", expanded);
		section.mergeContainer?.toggle(expanded);
		if (!expanded) return;
		if (!section.mergeView) this.createMergeView(path, section);
		section.mergeView?.a.requestMeasure();
		section.mergeView?.b.requestMeasure();
		section.scrollbar?.refresh();
	}

	private destroyMergeView(section: FileSection): void {
		if (section.mergeView) section.diff.editorState = section.mergeView.b.state;
		if (section.reviewControls) this.removeChild(section.reviewControls);
		section.reviewControls = undefined;
		if (section.scrollbar) this.removeChild(section.scrollbar);
		section.scrollbar = undefined;
		section.mergeView?.destroy();
		section.mergeView = null;
	}

	/** Create (or recreate) the MergeView for a section. */
	private createMergeView(path: string, section: FileSection): void {
		this.destroyMergeView(section);
		if (!section.mergeContainer) return;
		section.mergeContainer.empty();
		section.reviewControls = this.addChild(new ReviewControls(section.mergeContainer,
			() => section.mergeView?.b, section.diff.onReviewLatest));
		const syncScroll = createHorizontalScrollSync();
		const syncScrollEnabled = () => !this.settings.wordWrap;

		const syncA = (index: number) => {
			section.mergeView?.b.dispatch({effects: toggleFold.of(index)});
		};
		const syncB = (index: number) => {
			section.mergeView?.a.dispatch({effects: toggleFold.of(index)});
		};

		section.mergeView = new MergeView({
			a: {
				doc: section.diff.oldContent,
				extensions: [
					...foldUnchangedExtension(syncA),
					synchronizedScroll(syncScroll, () => section.mergeView?.b, syncScrollEnabled, () => section.scrollbar?.dom),
					EditorView.updateListener.of(() => section.scrollbar?.refresh()),
					lineNumbers(),
					this.lineWrapping.of(this.settings.wordWrap ? EditorView.lineWrapping : []),
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
				],
			},
			b: {
				doc: section.diff.draftContent,
				selection: section.diff.editorState?.selection,
				extensions: [
					history(),
					EditorState.transactionFilter.of(tr => this.applying.has(path) && tr.docChanged ? [] : tr),
					...(section.diff.editorState ? [historyField.init(() => section.diff.editorState!.field(historyField))] : []),
					keymap.of([...historyKeymap, ...defaultKeymap]),
					drawSelection(),
					EditorView.contentAttributes.of({"aria-label": "Result, editable draft"}),
					EditorView.updateListener.of(update => {
						section.diff.editorState = update.state;
						if (update.docChanged) section.diff.onDraftChange(update.state.doc.toString());
						section.reviewControls?.update(section.diff.conflicted);
					}),
					...foldUnchangedExtension(syncB),
					synchronizedScroll(syncScroll, () => section.mergeView?.a, syncScrollEnabled, () => section.scrollbar?.dom),
					EditorView.updateListener.of(() => section.scrollbar?.refresh()),
					lineNumbers(),
					this.lineWrapping.of(this.settings.wordWrap ? EditorView.lineWrapping : []),
				],
			},
			parent: section.mergeContainer,
			revertControls: "a-to-b",
			renderRevertControl: () => {
				const btn = createEl("button");
				btn.className = "diff-view-revert-btn";
				btn.textContent = "→";
				btn.title = "Restore original block";
				btn.setAttribute("aria-label", "Restore original block");
				return btn;
			},
			highlightChanges: true,
			gutter: false,
			diffConfig: this.settings.wordLevelHighlighting ? undefined : {override: lineDiff},
		});

		section.scrollbar = this.addChild(new DiffScrollbar(section.mergeContainer,
			section.mergeView, syncScrollEnabled, syncScroll));

		// Compute unchanged ranges and dispatch initial folds
		const chunks = section.mergeView.chunks;
		const rangesA = computeUnchangedRanges(section.mergeView.a.state.doc, chunks, "a", 2, 4);
		const rangesB = computeUnchangedRanges(section.mergeView.b.state.doc, chunks, "b", 2, 4);
		section.mergeView.a.dispatch({effects: setFoldRanges.of(rangesA)});
		section.mergeView.b.dispatch({effects: setFoldRanges.of(rangesB)});
		section.reviewControls.update(section.diff.conflicted);
	}

	/** Accept current state of editor B (includes any partial chunk reverts). */
	private async handleAccept(path: string): Promise<void> {
		const section = this.sections.get(path);
		if (!section || this.applying.has(path)) return;
		const content = section.mergeView
			? section.mergeView.b.state.doc.toString()
			: section.diff.draftContent;
		this.applying.add(path);
		try {
			if (await section.diff.onAccept(content) && this.sections.get(path) === section) this.removeFile(path);
		} finally {
			this.applying.delete(path);
		}
	}

	/** Reject changes for a file. */
	private async handleReject(path: string): Promise<void> {
		const section = this.sections.get(path);
		if (!section || this.applying.has(path)) return;
		this.applying.add(path);
		try {
			if (await section.diff.onReject() && this.sections.get(path) === section) this.removeFile(path);
		} finally {
			this.applying.delete(path);
		}
	}

	/** Accept all files and close the diff view. */
	private async handleAcceptAll(): Promise<void> {
		for (const path of [...this.sections.keys()]) await this.handleAccept(path);
	}

	/** Reject all files and close the diff view. */
	private async handleRejectAll(): Promise<void> {
		for (const path of [...this.sections.keys()]) await this.handleReject(path);
	}

	/** Remove a resolved file and re-render or close if empty. */
	removeFile(path: string): void {
		const section = this.sections.get(path);
		if (section) this.destroyMergeView(section);
		this.sections.delete(path);
		if (this.sections.size === 0) {
			this.leaf.detach();
		} else {
			this.render();
		}
	}
}
