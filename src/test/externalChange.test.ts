import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isSyncedWithDisk } from '../detectors/externalChange';
import { removeQuietly } from './cleanup';

suite('isSyncedWithDisk (real file, real VS Code)', () => {
	test('true after an external write reloads the buffer, false after an editor edit', async function () {
		this.timeout(30_000);
		const file = path.join(os.tmpdir(), `af-sync-${Date.now()}.txt`);
		fs.writeFileSync(file, 'one line\n');

		try {
			const doc = await vscode.workspace.openTextDocument(file);
			await vscode.window.showTextDocument(doc);

			const reloaded = new Promise<void>(resolve => {
				const sub = vscode.workspace.onDidChangeTextDocument(e => {
					if (e.document === doc && e.contentChanges.length > 0) {
						sub.dispose();
						resolve();
					}
				});
			});
			fs.writeFileSync(file, Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n') + '\n');
			// The headless test window doesn't reliably watch files outside a workspace,
			// so force the same reload-from-disk that a watcher event would trigger.
			await vscode.commands.executeCommand('workbench.action.files.revert');
			await reloaded;

			assert.strictEqual(doc.lineCount, 13, 'buffer should hold the 12 reloaded lines');
			assert.ok(await isSyncedWithDisk(doc), 'a disk reload must be recognised');

			const edit = new vscode.WorkspaceEdit();
			edit.insert(doc.uri, new vscode.Position(0, 0), 'pasted by the user\n');
			await vscode.workspace.applyEdit(edit);
			assert.ok(!(await isSyncedWithDisk(doc)), 'an editor edit must not look like a reload');
		} finally {
			await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
			removeQuietly(file);
		}
	});
});
