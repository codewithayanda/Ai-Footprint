import * as vscode from 'vscode';

export interface PasteSignal {
	lines: number;
	chars: number;
	languageId: string;
	clipboardMatched: boolean;     // text matched the OS clipboard exactly
	likelyOwnCode: boolean;        // text was recently produced inside this workspace
}

/**
 * Heuristically classifies large insertions as pastes and decides whether the
 * pasted text likely came from this workspace (in which case the caller may
 * choose to weight it less). We deliberately do not hook the paste *command*,
 * because not all pastes flow through it (drag/drop, source-control apply,
 * snippet expansion). Instead we observe insertions and cross-check with the
 * clipboard.
 */
export class PasteDetector {
	// Rolling set of texts the user has recently produced inside this workspace.
	// Used to recognize "I'm pasting my own code from another file".
	private readonly recentLocalTexts: string[] = [];
	private readonly RECENT_LOCAL_LIMIT = 32;

	constructor(private readonly clipboardAware: boolean) {}

	/** Call when the user types/edits something small, to feed the "own code" cache. */
	noteLocalEdit(text: string): void {
		if (text.length < 16) {return;}
		this.recentLocalTexts.push(text);
		if (this.recentLocalTexts.length > this.RECENT_LOCAL_LIMIT) {
			this.recentLocalTexts.shift();
		}
	}

	async classify(
		text: string,
		document: vscode.TextDocument,
	): Promise<PasteSignal> {
		const lines = countLines(text);
		let clipboardMatched = false;

		if (this.clipboardAware) {
			try {
				const clip = await vscode.env.clipboard.readText();
				clipboardMatched = clip.length > 0 && clip.trim() === text.trim();
			} catch {
				// Clipboard read can fail (permissions, remote environments). Treat as no match.
			}
		}

		const likelyOwnCode = this.recentLocalTexts.some(t => t.includes(text.trim()) || text.includes(t));

		return {
			lines,
			chars: text.length,
			languageId: document.languageId,
			clipboardMatched,
			likelyOwnCode,
		};
	}
}

export function countLines(text: string): number {
	if (!text) {return 0;}
	// A multi-line paste of N lines has N-1 newlines; treat a non-empty
	// trailing-newline-less segment as a final line so short snippets aren't 0.
	const newlines = text.split('\n').length - 1;
	const trailingLine = text.endsWith('\n') ? 0 : 1;
	return Math.max(1, newlines + trailingLine);
}
