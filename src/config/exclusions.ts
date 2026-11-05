import * as vscode from 'vscode';

export interface ExclusionSettings {
	excludeLanguages: string[];
	excludeGlobs: string[];
}

const MAX_CACHED = 500;

/** Decides whether edits in a document are ignored, using VS Code's own glob matcher. */
export class ExclusionFilter {
	private readonly cache = new Map<string, boolean>();

	constructor(private readonly read: () => ExclusionSettings) {}

	reset(): void {
		this.cache.clear();
	}

	isExcluded(document: vscode.TextDocument): boolean {
		const key = `${document.languageId}|${document.uri.toString()}`;
		let excluded = this.cache.get(key);
		if (excluded === undefined) {
			if (this.cache.size >= MAX_CACHED) {this.cache.clear();}
			excluded = matches(document, this.read());
			this.cache.set(key, excluded);
		}
		return excluded;
	}
}

function matches(document: vscode.TextDocument, { excludeLanguages, excludeGlobs }: ExclusionSettings): boolean {
	if (excludeLanguages.some(id => id.toLowerCase() === document.languageId.toLowerCase())) {return true;}
	if (excludeGlobs.length === 0) {return false;}
	return vscode.languages.match(excludeGlobs.map(pattern => ({ pattern, scheme: 'file' })), document) > 0;
}
