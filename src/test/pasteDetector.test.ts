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
