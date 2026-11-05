import * as assert from 'assert';
import * as vscode from 'vscode';
import { DocumentLike, PastedTexts, existsElsewhere } from '../detectors/pasteDetector';

const doc = (text: string, uri = 'file:///a.ts'): DocumentLike => ({ uri: vscode.Uri.parse(uri), getText: () => text });

const code = 'const alpha = compute(1);\nconst beta = compute(2);\nconst gamma = alpha + beta;';

suite('existsElsewhere', () => {
	test('text found in another open file is already in the workspace', () => {
		const target = doc(code, 'file:///target.ts');
		const other = doc(`header\n${code}\nfooter`, 'file:///other.ts');
		assert.ok(existsElsewhere(code, target, [target, other]));
	});

	test('text that appears only once, in the target itself, is new', () => {
		const target = doc(`x\n${code}\ny`, 'file:///target.ts');
		assert.ok(!existsElsewhere(code, target, [target]));
	});

	test('text that appears twice in the target was duplicated', () => {
		const target = doc(`${code}\n\n${code}\n`, 'file:///target.ts');
		assert.ok(existsElsewhere(code, target, [target]));
	});

	test('different indentation and line endings still match', () => {
		const target = doc(code, 'file:///target.ts');
		const other = doc(code.replace(/\n/g, '\r\n        '), 'file:///other.ts');
		assert.ok(existsElsewhere(code, target, [target, other]));
	});

	test('text that only partly overlaps is new', () => {
		const target = doc(code, 'file:///target.ts');
		const other = doc(code.split('\n').slice(0, 2).join('\n'), 'file:///other.ts');
		assert.ok(!existsElsewhere(code, target, [target, other]));
	});

	test('very short text never matches', () => {
		const target = doc('import x;', 'file:///target.ts');
		const other = doc('import x;\nimport x;', 'file:///other.ts');
		assert.ok(!existsElsewhere('import x;', target, [target, other]));
	});

	test('whitespace-only text never matches', () => {
		const target = doc('a', 'file:///target.ts');
		const other = doc('\n\n\n   \n', 'file:///other.ts');
		assert.ok(!existsElsewhere('\n\n\n\n\n\n   \n', target, [target, other]));
	});

	test('documents that are not files or untitled editors are ignored', () => {
		const target = doc(code, 'file:///target.ts');
		const output = doc(code, 'output:///log');
		assert.ok(!existsElsewhere(code, target, [target, output]));
	});

	test('untitled documents count as workspace code', () => {
		const target = doc(code, 'file:///target.ts');
		const scratch = doc(code, 'untitled:Untitled-1');
		assert.ok(existsElsewhere(code, target, [target, scratch]));
	});

	test('oversized documents are skipped', () => {
		const target = doc(code, 'file:///target.ts');
		const huge = doc(code + 'x'.repeat(2_000_001), 'file:///huge.ts');
		assert.ok(!existsElsewhere(code, target, [target, huge]));
	});

	test('no other documents means nothing to match', () => {
		const target = doc(code, 'file:///target.ts');
		assert.ok(!existsElsewhere(code, target, []));
	});
});

suite('PastedTexts', () => {
	test('the exact text that was counted is recognised', () => {
		const pasted = new PastedTexts();
		pasted.remember(code);
		assert.ok(pasted.contains(code));
	});

	test('any part of a counted paste is recognised too', () => {
		const pasted = new PastedTexts();
		pasted.remember(code);
		assert.ok(pasted.contains(code.split('\n').slice(0, 2).join('\n')));
	});

	test('indentation and line endings do not matter', () => {
		const pasted = new PastedTexts();
		pasted.remember(code);
		assert.ok(pasted.contains(code.replace(/\n/g, '\r\n\t\t')));
	});

	test('text that was never counted is not recognised', () => {
		const pasted = new PastedTexts();
		pasted.remember(code);
		assert.ok(!pasted.contains('function somethingElse() { return 42; }'));
		assert.ok(!new PastedTexts().contains(code));
	});

	test('text that only extends a counted paste is new', () => {
		const pasted = new PastedTexts();
		pasted.remember(code);
		assert.ok(!pasted.contains(code + '\nconst delta = alpha - beta;'));
	});

	test('very short text is never stored or matched', () => {
		const pasted = new PastedTexts();
		pasted.remember('import x;');
		assert.ok(!pasted.contains('import x;'));
	});

	test('the oldest texts are forgotten once the size budget is passed', () => {
		const pasted = new PastedTexts(100);
		const first = 'a'.repeat(60);
		const second = 'b'.repeat(60);
		pasted.remember(first);
		pasted.remember(second);
		assert.ok(!pasted.contains(first));
		assert.ok(pasted.contains(second));
	});

	test('the newest text is kept even when it alone exceeds the budget', () => {
		const pasted = new PastedTexts(100);
		pasted.remember('c'.repeat(500));
		assert.ok(pasted.contains('c'.repeat(500)));
	});
});
