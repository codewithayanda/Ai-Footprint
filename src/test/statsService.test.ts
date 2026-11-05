import * as assert from 'assert';
import { StatsService } from '../services/statsService';
import { STORAGE_KEYS } from '../constants';
import { fakeContext } from './fakeContext';

const FAST = { writeIntervalMs: 40, emitDelayMs: 10 };
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

suite('StatsService persistence', () => {
	test('a burst of edits causes no writes until the interval, then exactly one write pair', async () => {
		const { context, writes } = fakeContext();
		const stats = new StatsService(context, FAST);
		for (let i = 0; i < 100; i++) {stats.recordTyping(1);}

		assert.strictEqual(writes.length, 0, 'nothing is written synchronously');
		await sleep(120);
		assert.deepStrictEqual(writes.sort(), [STORAGE_KEYS.dailyStats, STORAGE_KEYS.streak].sort());
		stats.dispose();
	});

	test('a burst of edits produces a single UI update', async () => {
		const { context } = fakeContext();
		const stats = new StatsService(context, FAST);
		let events = 0;
		stats.onChanged(() => events++);

		for (let i = 0; i < 100; i++) {stats.recordTyping(1);}
		stats.recordPaste(10);
		await sleep(60);

		assert.strictEqual(events, 1);
		assert.strictEqual(stats.snapshot().today.totalLinesAdded, 110, 'no edit is lost by coalescing');
		stats.dispose();
	});

	test('flush writes pending changes immediately', async () => {
		const { context, store } = fakeContext();
		const stats = new StatsService(context, { writeIntervalMs: 60_000, emitDelayMs: 10 });
		stats.recordPaste(20);
		await stats.flush();

		const saved = store.get(STORAGE_KEYS.dailyStats) as Array<{ pastes: number }>;
		assert.strictEqual(saved[saved.length - 1].pastes, 1);
		stats.dispose();
	});

	test('flush with nothing pending writes nothing', async () => {
		const { context, writes } = fakeContext();
		const stats = new StatsService(context, FAST);
		await stats.flush();
		assert.strictEqual(writes.length, 0);
		stats.dispose();
	});

	test('dispose saves pending changes', async () => {
		const { context, writes } = fakeContext();
		const stats = new StatsService(context, { writeIntervalMs: 60_000, emitDelayMs: 10 });
		stats.recordNudge();
		stats.dispose();
		await sleep(20);
		assert.ok(writes.includes(STORAGE_KEYS.dailyStats));
	});

	test('clear wipes history and persists the empty state', async () => {
		const { context, store } = fakeContext();
		const stats = new StatsService(context, FAST);
		stats.recordPaste(50);
		await stats.clear();

		const today = stats.snapshot().today;
		assert.strictEqual(today.pastes, 0);
		assert.strictEqual(today.score, 100);
		const saved = store.get(STORAGE_KEYS.dailyStats) as Array<{ pastes: number }>;
		assert.ok(saved.every(d => d.pastes === 0));
		stats.dispose();
	});
});
