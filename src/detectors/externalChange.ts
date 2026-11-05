import * as vscode from 'vscode';

const normalize = (s: string): string => s.replace(/^﻿/, '').replace(/\r\n/g, '\n');

/** Compares text ignoring a leading BOM and CRLF vs LF. */
export function sameContent(a: string, b: string): boolean {
	return normalize(a) === normalize(b);
}

/** True when the buffer equals the file on disk, i.e. the change was a reload (git pull, checkout), not an edit. */
export async function isSyncedWithDisk(document: vscode.TextDocument): Promise<boolean> {
	if (document.uri.scheme !== 'file') {return false;}
	try {
		const bytes = await vscode.workspace.fs.readFile(document.uri);
		return sameContent(document.getText(), Buffer.from(bytes).toString('utf8'));
	} catch {
		return false;
	}
}
