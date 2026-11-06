import * as fs from 'fs';

type Remove = (target: string, options: fs.RmOptions) => void;

/**
 * Deletes a temp file or folder without ever failing a test. On Windows VS Code's file watchers
 * can still hold the folder for a moment, so deletion is retried; a leftover in the OS temp folder is harmless.
 */
export function removeQuietly(target: string, remove: Remove = fs.rmSync): void {
	try {
		remove(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	} catch {
		// The OS clears its temp folder eventually.
	}
}
