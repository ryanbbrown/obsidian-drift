import {Component, setIcon, setTooltip} from "obsidian";

export class DiffToolbar extends Component {
	constructor(container: HTMLElement, multiple: boolean, expand: (value: boolean) => void,
		accept: () => void, reject: () => void) {
		super();
		const toolbar = container.createDiv({cls: "diff-view-toolbar"});
		const navigation = toolbar.createDiv({cls: "diff-view-toolbar-navigation"});
		for (const [icon, label, expanded] of [
			["unfold-vertical", "Expand all files", true],
			["fold-vertical", "Collapse all files", false],
		] as const) {
			const button = navigation.createEl("button", {cls: "clickable-icon", attr: {"aria-label": label}});
			setIcon(button, icon);
			setTooltip(button, label);
			this.registerDomEvent(button, "click", () => expand(expanded));
		}
		if (multiple) {
			const actions = toolbar.createDiv({cls: "diff-view-toolbar-actions"});
			const acceptButton = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-accept", text: "Accept all"});
			const rejectButton = actions.createEl("button", {cls: "diff-view-btn diff-view-btn-reject", text: "Reject all"});
			this.registerDomEvent(acceptButton, "click", accept);
			this.registerDomEvent(rejectButton, "click", reject);
		}
	}
}
