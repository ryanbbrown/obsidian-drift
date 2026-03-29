import {ItemView, WorkspaceLeaf} from "obsidian";
import {Change, MergeView} from "@codemirror/merge";
import {EditorView, lineNumbers} from "@codemirror/view";
import {EditorState} from "@codemirror/state";
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

export interface PendingDiff {
	oldContent: string;
	newContent: string;
	onAccept: (content: string) => void | Promise<void>;
	onReject: () => void | Promise<void>;
	onWrite: (content: string) => void;
}

interface FileSection {
	diff: PendingDiff;
	expanded: boolean;
	mergeView: MergeView | null;
	mergeContainer: HTMLElement | null;
}

export class DiffView extends ItemView {
	private sections = new Map<string, FileSection>();

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
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
		this.sections.set(path, {diff, expanded: true, mergeView: null, mergeContainer: null});
		this.render();
	}

	async onOpen(): Promise<void> {}

	onClose(): Promise<void> {
		for (const section of this.sections.values()) {
			section.mergeView?.destroy();
		}
		this.sections.clear();
		return Promise.resolve();
	}

	private render(): void {
		for (const section of this.sections.values()) {
			section.mergeView?.destroy();
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

		const scrollArea = container.createDiv({cls: "diff-view-scroll"});

		for (const [path, section] of this.sections) {
			const block = scrollArea.createDiv({cls: "diff-view-section"});

			// Collapsible header
			const header = block.createDiv({cls: "diff-view-section-header"});

			const left = header.createDiv({cls: "diff-view-section-left"});
			left.createSpan({cls: `diff-view-chevron ${section.expanded ? "is-expanded" : ""}`, text: "›"});
			left.createSpan({cls: "diff-view-filepath", text: path});
			left.addEventListener("click", () => {
				section.expanded = !section.expanded;
				this.render();
			});

			const actions = header.createDiv({cls: "diff-view-actions"});
			const acceptBtn = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-accept", text: "Accept"});
			const rejectBtn = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-reject", text: "Reject"});

			acceptBtn.addEventListener("click", (e) => { e.stopPropagation(); this.handleAccept(path); });
			rejectBtn.addEventListener("click", (e) => { e.stopPropagation(); this.handleReject(path); });

			if (section.expanded) {
				const mergeContainer = block.createDiv({cls: "diff-view-merge cm-s-obsidian mod-cm6"});
				section.mergeContainer = mergeContainer;
				this.createMergeView(path, section);
			}
		}
	}

	/** Create (or recreate) the MergeView for a section. */
	private createMergeView(path: string, section: FileSection): void {
		if (section.mergeView) {
			section.mergeView.destroy();
			section.mergeView = null;
		}
		if (!section.mergeContainer) return;
		section.mergeContainer.empty();

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
					lineNumbers(),
					EditorView.editable.of(false),
					EditorState.readOnly.of(true),
				],
			},
			b: {
				doc: section.diff.newContent,
				extensions: [
					...foldUnchangedExtension(syncB),
					lineNumbers(),
				],
			},
			parent: section.mergeContainer,
			revertControls: "a-to-b",
			renderRevertControl: () => {
				const btn = document.createElement("button");
				btn.className = "diff-view-revert-btn";
				btn.textContent = "←";
				btn.title = "Revert this change";
				return btn;
			},
			highlightChanges: true,
			gutter: false,
			diffConfig: {override: lineDiff},
		});

		// Compute unchanged ranges and dispatch initial folds
		const chunks = section.mergeView.chunks;
		const rangesA = computeUnchangedRanges(section.mergeView.a.state.doc, chunks, "a", 2, 4);
		const rangesB = computeUnchangedRanges(section.mergeView.b.state.doc, chunks, "b", 2, 4);
		section.mergeView.a.dispatch({effects: setFoldRanges.of(rangesA)});
		section.mergeView.b.dispatch({effects: setFoldRanges.of(rangesB)});

		// Write to disk on per-chunk revert. CM6 handles revert via mousedown on .cm-merge-revert container.
		const revertContainer = section.mergeContainer?.querySelector(".cm-merge-revert");
		if (revertContainer) {
			revertContainer.addEventListener("mousedown", () => {
				setTimeout(() => {
					if (!section.mergeView) return;
					const content = section.mergeView.b.state.doc.toString();
					section.diff.onWrite(content);
					section.diff.newContent = content;
					if (content === section.diff.oldContent) {
						this.removeFile(path);
					}
				}, 50);
			});
		}
	}

	/** Accept current state of editor B (includes any partial chunk reverts). */
	private handleAccept(path: string): void {
		const section = this.sections.get(path);
		if (!section) return;
		const content = section.mergeView
			? section.mergeView.b.state.doc.toString()
			: section.diff.newContent;
		void section.diff.onAccept(content);
		this.removeFile(path);
	}

	/** Reject changes for a file. */
	private handleReject(path: string): void {
		const section = this.sections.get(path);
		if (!section) return;
		void section.diff.onReject();
		this.removeFile(path);
	}

	/** Remove a resolved file and re-render or close if empty. */
	removeFile(path: string): void {
		const section = this.sections.get(path);
		section?.mergeView?.destroy();
		this.sections.delete(path);
		if (this.sections.size === 0) {
			this.leaf.detach();
		} else {
			this.render();
		}
	}
}
