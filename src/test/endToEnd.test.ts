import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../extension';

// Every call gets text no earlier test used, so a lingering open document can't look like "already in the workspace".
let blocks = 0;
const block = (lines: number, tag = `t${++blocks}x`): string =>
	Array.from({ length: lines }, (_, i) => `const ${tag}${i} = ${i};`).join('\n');

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<boolean> {
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		if (condition()) {return true;}
		await sleep(25);
	}
	return condition();
}

async function openUntitled(): Promise<vscode.TextEditor> {
	const doc = await vscode.workspace.openTextDocument({ content: '', language: 'typescript' });
	return vscode.window.showTextDocument(doc);
}

const paste = (): Thenable<unknown> => vscode.commands.executeCommand('editor.action.clipboardPasteAction');

suite('end to end (real editor events through the real extension)', function () {
	this.timeout(60_000);

	let api: ExtensionApi;
	let originalClipboard = '';
	const show = (): string => JSON.stringify(api.snapshot().today);

	suiteSetup(async () => {
		const ext = vscode.extensions.getExtension<ExtensionApi>('codewithayanda.ai-footprint');
		assert.ok(ext, 'the extension under test must be installed in the test host');
		api = await ext.activate();
		originalClipboard = await vscode.env.clipboard.readText();
	});

	suiteTeardown(async () => {
		await vscode.env.clipboard.writeText(originalClipboard);
	});

	setup(async () => { await api.clearStats(); });
	teardown(async () => { await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'); });

	test('typing counts lines by Enter, never by keystroke', async () => {
		await openUntitled();
		for (let line = 0; line < 3; line++) {
			for (const ch of 'const a = 1;') {await vscode.commands.executeCommand('type', { text: ch });}
			await vscode.commands.executeCommand('type', { text: '\n' });
		}
		assert.ok(await waitFor(() => api.snapshot().today.totalLinesAdded === 3), show());
		assert.strictEqual(api.snapshot().today.pastes, 0, show());
		assert.strictEqual(api.snapshot().reliance, 0, show());
	});

	test('a real paste of 10 lines is counted once', async () => {
		await openUntitled();
		await vscode.env.clipboard.writeText(block(10));
		await paste();
		assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), show());
		assert.strictEqual(api.snapshot().today.pastedLines, 10, show());
		assert.strictEqual(api.snapshot().reliance, 100, show());
	});

	test('a large insertion that is not on the clipboard is ignored, and the next real paste still counts', async () => {
		const editor = await openUntitled();
		await vscode.env.clipboard.writeText('something else entirely');
		await editor.edit(b => b.insert(new vscode.Position(0, 0), block(10)));
		await sleep(1_000);
		assert.strictEqual(api.snapshot().today.pastes, 0, `not from the clipboard, must not count: ${show()}`);

		await vscode.env.clipboard.writeText(block(10));
		await paste();
		assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), `handler must still be alive: ${show()}`);
	});

	test('undoing a deletion is not counted as a paste', async () => {
		const editor = await openUntitled();
		const text = block(10);
		await vscode.env.clipboard.writeText(text);
		await paste();
		assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), show());

		const whole = new vscode.Range(new vscode.Position(0, 0), editor.document.lineAt(editor.document.lineCount - 1).range.end);
		await editor.edit(b => b.delete(whole));
		assert.strictEqual(editor.document.getText(), '');

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(editor.document.getText().replace(/\r\n/g, '\n'), text, 'undo must put the text back');
		await sleep(1_000);
		assert.strictEqual(api.snapshot().today.pastes, 1, `undo must not add a paste: ${show()}`);
	});

	test('a file reloaded from disk (git pull, switch) is not counted, but a real paste into it is', async () => {
		const file = path.join(os.tmpdir(), `af-e2e-${Date.now()}.ts`);
		fs.writeFileSync(file, 'one line\n');
		try {
			const doc = await vscode.workspace.openTextDocument(file);
			await vscode.window.showTextDocument(doc);

			fs.writeFileSync(file, block(12) + '\n');
			// Headless windows don't reliably watch files outside a workspace; revert forces the same reload.
			await vscode.commands.executeCommand('workbench.action.files.revert');
			assert.ok(await waitFor(() => doc.lineCount === 13), 'the buffer must show the reloaded content');
			await sleep(1_000);
			assert.strictEqual(api.snapshot().today.pastes, 0, `a disk reload must not count: ${show()}`);

			await vscode.env.clipboard.writeText(block(12));
			await paste();
			assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), `a real paste must count: ${show()}`);
		} finally {
			await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
			fs.rmSync(file, { force: true });
		}
	});

	async function pasteIntoFile(fileName: string): Promise<void> {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-'));
		const file = path.join(dir, fileName);
		fs.writeFileSync(file, 'one line\n');
		try {
			await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
			await vscode.env.clipboard.writeText(block(10));
			await paste();
			await sleep(1_000);
		} finally {
			await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}

	test('a paste into an excluded file (a lockfile) is ignored', async () => {
		await pasteIntoFile('package-lock.json');
		assert.strictEqual(api.snapshot().today.pastes, 0, show());
	});

	test('the same paste into a normal file is counted', async () => {
		await pasteIntoFile('notes.ts');
		assert.strictEqual(api.snapshot().today.pastes, 1, show());
	});

	test('excluding a language takes effect immediately, and removing it brings detection back', async () => {
		const config = vscode.workspace.getConfiguration('aiFootprint');
		try {
			await config.update('excludeLanguages', ['typescript'], vscode.ConfigurationTarget.Global);
			await sleep(300);
			await openUntitled();
			await vscode.env.clipboard.writeText(block(10));
			await paste();
			await sleep(1_000);
			assert.strictEqual(api.snapshot().today.pastes, 0, `typescript is excluded: ${show()}`);

			await config.update('excludeLanguages', undefined, vscode.ConfigurationTarget.Global);
			await sleep(300);
			await vscode.env.clipboard.writeText(block(10));
			await paste();
			assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), `detection must come back: ${show()}`);
		} finally {
			await config.update('excludeLanguages', undefined, vscode.ConfigurationTarget.Global);
		}
	});

	async function withSourceFile(name: string, content: string, run: (file: string) => Promise<void>): Promise<void> {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-e2e-'));
		const file = path.join(dir, name);
		fs.writeFileSync(file, content);
		try {
			await run(file);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}

	test('code copied from another open file is not counted as a paste', async () => {
		const text = block(10);
		await withSourceFile('source.ts', text + '\n', async file => {
			await vscode.workspace.openTextDocument(file);
			await openUntitled();
			await vscode.env.clipboard.writeText(text);
			await paste();
			await sleep(1_000);
			assert.strictEqual(api.snapshot().today.pastes, 0, `it was already in an open file: ${show()}`);
		});
	});

	test('duplicating a block inside the same file is not counted', async () => {
		const text = block(10);
		await withSourceFile('dup.ts', text + '\n', async file => {
			try {
				await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
				await vscode.commands.executeCommand('cursorBottom');
				await vscode.env.clipboard.writeText(text + '\n');
				await paste();
				await sleep(1_000);
				assert.strictEqual(api.snapshot().today.pastes, 0, `it was already in this file: ${show()}`);
			} finally {
				await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
			}
		});
	});

	test('a paste that only partly overlaps open code still counts', async () => {
		const source = block(10);
		const pasted = source.split('\n').slice(0, 9).concat('const somethingNew = 1;').join('\n');
		await withSourceFile('source.ts', source + '\n', async file => {
			await vscode.workspace.openTextDocument(file);
			await openUntitled();
			await vscode.env.clipboard.writeText(pasted);
			await paste();
			assert.ok(await waitFor(() => api.snapshot().today.pastes === 1), `partial overlap is new code: ${show()}`);
		});
	});
});
