import type {TFile, Vault} from "obsidian";

export interface ReviewSnapshot {
	oldContent: string;
	/** The disk version against which this draft was reviewed. */
	newContent: string;
	draftContent: string;
	conflicted: boolean;
}

export interface PersistedDiffEntry {
	path: string;
	oldContent: string;
	newContent: string;
	draftContent?: string;
}

export function restoreReview(entry: PersistedDiffEntry, current: string): ReviewSnapshot | null {
	const draft = entry.draftContent ?? entry.newContent;
	if (draft !== entry.newContent) {
		return {oldContent: entry.oldContent, newContent: entry.newContent,
			draftContent: draft, conflicted: current !== entry.newContent};
	}
	if (current === entry.oldContent) return null;
	return {oldContent: entry.oldContent, newContent: current, draftContent: current, conflicted: false};
}

export class ReviewConflictError extends Error {
	constructor() {
		super("The file changed after this review started.");
	}
}

/** Compare inside Vault.process so checking and writing use one file operation. */
export async function writeReviewedContent(vault: Pick<Vault, "process">, file: TFile,
	expected: string, result: string, beforeWrite: () => void): Promise<void> {
	await vault.process(file, current => {
		if (current !== expected) throw new ReviewConflictError();
		beforeWrite();
		return result;
	});
}
