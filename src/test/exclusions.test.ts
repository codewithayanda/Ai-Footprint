import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ExclusionFilter, ExclusionSettings } from '../config/exclusions';
import { removeQuietly } from './cleanup';

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const defaultGlobs: string[] = manifest.contributes.configuration.properties['aiFootprint.excludeGlobs'].default;

suite('ExclusionFilter', function () {
	this.timeout(20_000);

	let root = '';
	const open = (relative: string): Thenable<vscode.TextDocument> => {
		const file = path.join(root, relative);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, 'x\n');
		return vscode.workspace.openTextDocument(file);
	};
	const withDefaults = (): ExclusionFilter => new ExclusionFilter(() => ({ excludeLanguages: [], excludeGlobs: defaultGlobs }));

	suiteSetup(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-excl-')); });
	suiteTeardown(() => { removeQuietly(root); });

	for (const excluded of [
		'package-lock.json',
		'sub/yarn.lock',
		'pnpm-lock.yaml',
		'dist/bundle.js',
		'out/test/a.js',
		'node_modules/pkg/index.js',
		'.git/COMMIT_EDITMSG',
		'app.min.js',
		'app.js.map',
	]) {
		test(`default globs ignore ${excluded}`, async () => {
			assert.ok(withDefaults().isExcluded(await open(excluded)));
		});
	}

	for (const kept of ['src/app.ts', 'notes.md', 'package.json', 'distribution/readme.ts']) {
		test(`default globs keep ${kept}`, async () => {
			assert.ok(!withDefaults().isExcluded(await open(kept)));
		});
	}

	test('excluded languages are ignored, case-insensitively', async () => {
		const filter = new ExclusionFilter(() => ({ excludeLanguages: ['Markdown'], excludeGlobs: [] }));
		const md = await vscode.workspace.openTextDocument({ content: '', language: 'markdown' });
		const ts = await vscode.workspace.openTextDocument({ content: '', language: 'typescript' });
		assert.ok(filter.isExcluded(md));
		assert.ok(!filter.isExcluded(ts));
	});

	test('globs never match an unsaved (untitled) document', async () => {
		const filter = new ExclusionFilter(() => ({ excludeLanguages: [], excludeGlobs: ['**/*'] }));
		const untitled = await vscode.workspace.openTextDocument({ content: '', language: 'typescript' });
		assert.ok(!filter.isExcluded(untitled));
	});

	test('empty settings exclude nothing', async () => {
		const filter = new ExclusionFilter(() => ({ excludeLanguages: [], excludeGlobs: [] }));
		assert.ok(!filter.isExcluded(await open('package-lock.json')));
	});

	test('a settings change only applies after reset', async () => {
		const settings: ExclusionSettings = { excludeLanguages: [], excludeGlobs: [] };
		const filter = new ExclusionFilter(() => settings);
		const doc = await open('src/app.ts');

		assert.ok(!filter.isExcluded(doc));
		settings.excludeGlobs = ['**/src/**'];
		assert.ok(!filter.isExcluded(doc), 'cached answer is kept until reset');
		filter.reset();
		assert.ok(filter.isExcluded(doc));
	});
});
