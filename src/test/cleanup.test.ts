import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { removeQuietly } from './cleanup';

suite('removeQuietly', () => {
	test('removes a folder with nested files', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-clean-'));
		fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
		fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'x');
		removeQuietly(dir);
		assert.ok(!fs.existsSync(dir));
	});

	test('removes a single file', () => {
		const file = path.join(os.tmpdir(), `af-clean-${Date.now()}.txt`);
		fs.writeFileSync(file, 'x');
		removeQuietly(file);
		assert.ok(!fs.existsSync(file));
	});

	test('a path that does not exist is fine', () => {
		assert.doesNotThrow(() => removeQuietly(path.join(os.tmpdir(), 'af-clean-never-existed')));
	});

	test('deletion asks Node to retry the errors a busy Windows folder produces', () => {
		let seen: fs.RmOptions | undefined;
		removeQuietly('anywhere', (_target, options) => { seen = options; });
		assert.strictEqual(seen?.recursive, true);
		assert.strictEqual(seen?.force, true);
		assert.ok((seen?.maxRetries ?? 0) >= 5, 'needs several retries');
		assert.ok((seen?.retryDelay ?? 0) >= 50, 'needs a pause between retries');
	});

	test('a folder that cannot be deleted never fails the test', () => {
		const stuck = Object.assign(new Error('ENOTEMPTY: directory not empty'), { code: 'ENOTEMPTY' });
		assert.doesNotThrow(() => removeQuietly('anywhere', () => { throw stuck; }));
	});
});
