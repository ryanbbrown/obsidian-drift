import {Component} from "obsidian";
import type {MergeView} from "@codemirror/merge";
import type {createHorizontalScrollSync} from "./syncScroll";

/** A shared scrollbar outside the merge view's vertical scrolling content. */
export class DiffScrollbar extends Component {
	readonly dom: HTMLElement;
	private track: HTMLElement;
	private frame: number | null = null;
	private disposed = false;

	constructor(container: HTMLElement, private merge: MergeView,
		private isEnabled: () => boolean, sync: ReturnType<typeof createHorizontalScrollSync>) {
		super();
		this.dom = container.createDiv({cls: "diff-view-horizontal-scroll", attr: {
			"aria-label": "Scroll both diff panes horizontally", "tabindex": "0",
		}});
		this.track = this.dom.createDiv({cls: "diff-view-horizontal-track"});
		const win = this.dom.win;
		this.registerDomEvent(this.dom, "scroll", () => {
			sync(this.dom, [merge.a.scrollDOM, merge.b.scrollDOM], isEnabled());
		});
		const observer = new ResizeObserver(() => this.refresh());
		for (const element of [this.dom, merge.a.scrollDOM, merge.b.scrollDOM,
			merge.a.contentDOM, merge.b.contentDOM]) observer.observe(element);
		this.register(() => {
			this.disposed = true;
			observer.disconnect();
			if (this.frame !== null) win.cancelAnimationFrame(this.frame);
			this.dom.remove();
		});
		this.refresh();
	}

	refresh(): void {
		if (this.disposed || this.frame !== null) return;
		this.frame = this.dom.win.requestAnimationFrame(() => {
			this.frame = null;
			const panes = [this.merge.a.scrollDOM, this.merge.b.scrollDOM];
			const overflow = Math.max(...panes.map(pane => pane.scrollWidth - pane.clientWidth));
			this.dom.toggle(this.isEnabled() && overflow > 0);
			this.track.style.width = `${this.dom.clientWidth + overflow}px`;
		});
	}
}
