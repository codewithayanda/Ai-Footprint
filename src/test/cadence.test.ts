import * as assert from 'assert';
import { CadenceTracker, blendBaseline, isFasterThanBaseline } from '../detectors/cadenceTracker';
import { STORAGE_KEYS } from '../constants';
import { fakeContext } from './fakeContext';

const LANG = 'typescript';

function typist(initial: Record<string, unknown> = {}) {
	const { context, writes, store } = fakeContext(initial);
	let t = 1_000;
	const tracker = new CadenceTracker(context, () => t);
	return {
		tracker,
		type(count: number, intervalMs: number): void {
			for (let i = 0; i < count; i++) {
				t += intervalMs;
				tracker.track(LANG, 1, 0);
			}
		},
		baselineWrites: () => writes.filter(k => k === STORAGE_KEYS.cadenceBaselines).length,
		baseline: () => (store.get(STORAGE_KEYS.cadenceBaselines) as Record<string, { medianMs: number }> | undefined)?.[LANG]?.medianMs,
	};
}

const storedBaseline = (medianMs: number) => ({
	[STORAGE_KEYS.cadenceBaselines]: { [LANG]: { medianMs, madMs: 0, samples: 50, updatedAt: 0 } },
});

suite('CadenceTracker', () => {
	test('the baseline is saved on a schedule, not on every keystroke', () => {
		const t = typist();
		t.type(400, 200);
		const writes = t.baselineWrites();
		assert.ok(writes >= 1 && writes <= 8, `expected 1-8 writes for 400 keystrokes, got ${writes}`);
	});

	test('the first baseline appears after 50 intervals', () => {
		const t = typist();
		t.type(40, 200);
		assert.strictEqual(t.baseline(), undefined);
		t.type(20, 200);
		assert.strictEqual(t.baseline(), 200);
	});

	test('a stored baseline is blended with the new window, not replaced', () => {
		const t = typist(storedBaseline(100));
		t.type(60, 300);
		assert.strictEqual(t.baseline(), 160);
	});

	test('a burst much faster than the baseline is flagged', () => {
		const t = typist();
		t.type(60, 200);
		t.type(40, 50);
		assert.ok(t.tracker.isSuspiciouslyFast(LANG));
	});

	test('a fast window does not overwrite the baseline', () => {
		const t = typist(storedBaseline(300));
		t.type(60, 60);
		assert.strictEqual(t.baseline(), 300);
		assert.strictEqual(t.baselineWrites(), 0);
	});

	test('key auto-repeat speed is ignored', () => {
		const t = typist();
		t.type(60, 200);
		t.type(80, 30);
		assert.ok(!t.tracker.isSuspiciouslyFast(LANG));
	});

	test('steady typing is not flagged', () => {
		const t = typist();
		t.type(120, 200);
		assert.ok(!t.tracker.isSuspiciouslyFast(LANG));
	});

	test('clear drops the baseline and the live window', async () => {
		const t = typist();
		t.type(60, 200);
		await t.tracker.clear();
		assert.strictEqual(t.baseline(), undefined);
		t.type(40, 50);
		assert.ok(!t.tracker.isSuspiciouslyFast(LANG));
	});
});

suite('cadence helpers', () => {
	test('too few samples is never fast', () => assert.ok(!isFasterThanBaseline([10, 10, 10], 1_000)));
	test('the first baseline is the window median', () => {
		assert.strictEqual(blendBaseline(undefined, [100, 200, 300], 5).medianMs, 200);
	});
	test('a later baseline moves 30% toward the window', () => {
		const prev = { medianMs: 100, madMs: 0, samples: 1, updatedAt: 0 };
		assert.strictEqual(blendBaseline(prev, [200, 200, 200], 5).medianMs, 130);
	});
});
