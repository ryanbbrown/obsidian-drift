import {EditorView} from "@codemirror/view";

/** Share one synchronizer between the two editors of a file. */
export function createHorizontalScrollSync() {
	const expected = new WeakMap<HTMLElement, number>();
	const previous = new WeakMap<HTMLElement, number>();

	return (source: HTMLElement, targets: HTMLElement | HTMLElement[], enabled: boolean): void => {
		const left = source.scrollLeft;
		const last = previous.get(source) ?? 0;
		previous.set(source, left);
		const pending = expected.get(source);
		expected.delete(source);
		// Ignore vertical scrolling and events caused by our own scroll writes.
		if (!enabled || left === last || left === pending) return;
		for (const target of Array.isArray(targets) ? targets : [targets]) {
			if (target.scrollLeft === left) continue;
			target.scrollLeft = left;
			// Read back the actual offset: a shorter pane may clamp it.
			expected.set(target, target.scrollLeft);
		}
	};
}

/** CodeMirror owns the listener and removes it when the editor is destroyed. */
export function synchronizedScroll(
	sync: ReturnType<typeof createHorizontalScrollSync>,
	getSibling: () => EditorView | undefined,
	isEnabled: () => boolean,
	getScrollbar: () => HTMLElement | undefined = () => undefined,
) {
	return EditorView.domEventHandlers({
		scroll(event, view) {
			const sibling = getSibling();
			if (event.target === view.scrollDOM && sibling) {
				const scrollbar = getScrollbar();
				sync(view.scrollDOM, scrollbar ? [sibling.scrollDOM, scrollbar] : sibling.scrollDOM, isEnabled());
			}
		},
	});
}
