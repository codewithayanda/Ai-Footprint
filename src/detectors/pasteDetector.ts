import * as vscode from 'vscode';

/** 'unknown' means we couldn't tell (setting off, unreadable or empty clipboard) and must not discard the insertion. */
export type ClipboardResult = 'match' | 'mismatch' | 'unknown';

export interface PasteSignal {
	lines: number;
	chars: number;
	languageId: string;
	clipboard: ClipboardResult;
	alreadyInWorkspace: boolean;
}

const MIN_MATCH_CHARS = 20;
const MAX_DOC_CHARS = 2_000_000;

export type DocumentLike = Pick<vscode.TextDocument, 'uri' | 'getText'>;

/** Classifies a large insertion: does it match the clipboard, and was the text already in the workspace? */
export class PasteDetector {
	constructor(private readonly isClipboardAware: () => boolean) {}

	async classify(text: string, document: vscode.TextDocument): Promise<PasteSignal> {
		let clipboard: ClipboardResult = 'unknown';

		if (this.isClipboardAware()) {
			try {
				clipboard = compareToClipboard(text, await vscode.env.clipboard.readText());
			} catch {
				// Unreadable clipboard (remote, permissions) stays 'unknown'.
			}
		}

		return {
			lines: countLines(text),
			chars: text.length,
			languageId: document.languageId,
			clipboard,
			alreadyInWorkspace: existsElsewhere(text, document, vscode.workspace.textDocuments),
		};
	}
}

const squash = (s: string): string => s.replace(/\s+/g, '');

/** Whitespace-insensitive, since VS Code re-indents pasted text. */
export function compareToClipboard(text: string, clipboard: string): ClipboardResult {
	if (clipboard.length === 0) {return 'unknown';}
	return squash(text) === squash(clipboard) ? 'match' : 'mismatch';
}

/**
 * True when the text is in another open file, or twice in the target file
 * (once is the insertion itself). Whitespace is ignored; very short text never matches.
 */
export function existsElsewhere(text: string, target: DocumentLike, documents: readonly DocumentLike[]): boolean {
	const needle = squash(text);
	if (needle.length < MIN_MATCH_CHARS) {return false;}

	for (const doc of documents) {
		if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') {continue;}
		const raw = doc.getText();
		if (raw.length > MAX_DOC_CHARS) {continue;}

		const haystack = squash(raw);
		const first = haystack.indexOf(needle);
		if (first === -1) {continue;}
		if (doc.uri.toString() !== target.uri.toString()) {return true;}
		if (haystack.indexOf(needle, first + needle.length) !== -1) {return true;}
	}
	return false;
}

/** Line breaks an edit inserted: 0 for a typed char, 1 for Enter (unlike `countLines`, which is >= 1). */
export function countNewlines(text: string): number {
	if (!text) {return 0;}
	let count = 0;
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {count++;}
	return count;
}

export function countLines(text: string): number {
	if (!text) {return 0;}
	const newlines = text.split('\n').length - 1;
	const trailingLine = text.endsWith('\n') ? 0 : 1;
	return Math.max(1, newlines + trailingLine);
}
