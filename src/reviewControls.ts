import {Component, setIcon, setTooltip} from "obsidian";
import {redo, redoDepth, undo, undoDepth} from "@codemirror/commands";
import type {EditorView} from "@codemirror/view";

/** Labels and draft actions, kept outside the scrolling editor content. */
export class ReviewControls extends Component {
	private undoButton: HTMLButtonElement;
	private redoButton: HTMLButtonElement;
	private status: HTMLElement;
	private latestButton: HTMLButtonElement;

	constructor(container: HTMLElement, private getEditor: () => EditorView | undefined,
		reviewLatest: () => Promise<void>) {
		super();
		const labels = container.createDiv({cls: "diff-view-review-labels"});
		labels.createDiv({text: "Original", cls: "diff-view-original-label"});
		const result = labels.createDiv({cls: "diff-view-result-label"});
		result.createSpan({text: "Result · Editable"});
		const actions = result.createDiv({cls: "diff-view-history-actions"});
		this.undoButton = actions.createEl("button", {cls: "clickable-icon", attr: {"aria-label": "Undo"}});
		this.redoButton = actions.createEl("button", {cls: "clickable-icon", attr: {"aria-label": "Redo"}});
		setIcon(this.undoButton, "undo-2");
		setIcon(this.redoButton, "redo-2");
		setTooltip(this.undoButton, "Undo");
		setTooltip(this.redoButton, "Redo");
		for (const [button, command] of [[this.undoButton, undo], [this.redoButton, redo]] as const) {
			this.registerDomEvent(button, "click", () => {
				const editor = this.getEditor();
				if (!editor) return;
				command(editor);
				editor.focus();
			});
		}
		const statusRow = container.createDiv({cls: "diff-view-review-status"});
		this.status = statusRow.createSpan({attr: {"aria-live": "polite"}});
		this.latestButton = statusRow.createEl("button", {text: "Review latest changes"});
		this.registerDomEvent(this.latestButton, "click", () => { void reviewLatest(); });
	}

	update(conflicted: boolean): void {
		const editor = this.getEditor();
		this.undoButton.disabled = !editor || undoDepth(editor.state) === 0;
		this.redoButton.disabled = !editor || redoDepth(editor.state) === 0;
		this.latestButton.toggle(conflicted);
		this.status.setText(conflicted
			? "File changed again. Review the latest version before applying your draft."
			: "Draft only. Select Accept to save the result.");
	}
}
