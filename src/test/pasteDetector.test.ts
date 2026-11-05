import * as assert from 'assert';
import * as vscode from 'vscode';
import { PasteDetector } from '../detectors/pasteDetector';

suite('PasteDetector.classify (real clipboard)', function () {
	this.timeout(20_000);

	const block = Array.from({ length: 8 }, (_, i) => `const v${i} = ${i};`).join('\n');
	let original = '';

	setup(async () => { original = await vscode.env.clipboard.readText(); });
	teardown(async () => { await vscode.env.clipboard.writeText(original); });

	async function openDoc(): Promise<vscode.TextDocument> {
		return vscode.workspace.openTextDocument({ content: '', language: 'typescript' });
	}

	test('text copied to the clipboard is a match', async () => {
		await vscode.env.clipboard.writeText(block);
		const signal = await new PasteDetector(() => true).classify(block, await openDoc());
		assert.strictEqual(signal.clipboard, 'match');
	});

	test('text that is not on the clipboard is a mismatch', async () => {
		await vscode.env.clipboard.writeText('something else entirely');
		const signal = await new PasteDetector(() => true).classify(block, await openDoc());
		assert.strictEqual(signal.clipboard, 'mismatch');
	});

	test('clipboardAware off never reads the clipboard', async () => {
		await vscode.env.clipboard.writeText('something else entirely');
		const signal = await new PasteDetector(() => false).classify(block, await openDoc());
		assert.strictEqual(signal.clipboard, 'unknown');
	});
});

suite('PasteDetector own-code check (real documents)', function () {
	this.timeout(20_000);

	test('a block counted as a paste is no longer reported as already in the workspace', async () => {
		const stamp = Date.now();
		const text = Array.from({ length: 6 }, (_, i) => `const own${stamp}x${i} = ${i};`).join('\n');
		const doc = await vscode.workspace.openTextDocument({ content: `${text}\n${text}`, language: 'typescript' });
		const detector = new PasteDetector(() => false);

		assert.strictEqual((await detector.classify(text, doc)).alreadyInWorkspace, true, 'a duplicate of uncounted text is your own code');
		detector.remember(text);
		assert.strictEqual((await detector.classify(text, doc)).alreadyInWorkspace, false, 'once counted, pasting it again is a paste');
	});
});
