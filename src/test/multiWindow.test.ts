import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
	DayRecord, StatsService, StreakRecord, emptyDay, isoDate, mergeDay, mergeStreak,
} from '../services/statsService';
import { STORAGE_KEYS } from '../constants';
import { fakeContext } from './fakeContext';

const MANUAL = { writeIntervalMs: 60_000, emitDelayMs: 10, pullIntervalMs: 60_000 };
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const storedToday = (store: Map<string, unknown>): DayRecord => {
	const days = store.get(STORAGE_KEYS.dailyStats) as DayRecord[];
	return days.find(d => d.date === isoDate(new Date()))!;
};

suite('two windows sharing one storage', () => {
	const services: StatsService[] = [];
	const open = (context: vscode.ExtensionContext, timing: Partial<typeof MANUAL> = MANUAL): StatsService => {
		const s = new StatsService(context, timing);
		services.push(s);
		return s;
	};
	teardown(() => { while (services.length) {services.pop()!.dispose();} });

	test('pastes recorded in both windows add up instead of one overwriting the other', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordPaste(10); a.recordPaste(10); b.recordPaste(10);
		await a.flush();
		await b.flush();

		const today = storedToday(store);
		assert.deepStrictEqual([today.pastes, today.pastedLines, today.totalLinesAdded], [3, 30, 30]);
	});

	test('typed lines, nudges and the hourly buckets add up too', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordTyping(7); a.recordNudge(); a.recordPaste(10);
		b.recordTyping(5); b.recordNudge(); b.recordPaste(10);
		await a.flush();
		await b.flush();

		const today = storedToday(store);
		assert.strictEqual(today.totalLinesAdded, 7 + 5 + 10 + 10);
		assert.strictEqual(today.nudges, 2);
		assert.strictEqual(today.hourlyPastes.reduce((s, n) => s + n, 0), 2);
	});

	test('score deductions from both windows combine', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordPaste(50);
		b.recordPaste(25);
		await a.flush();
		await b.flush();
		assert.strictEqual(storedToday(store).score, 100 - 10 - 5);
	});

	test('the biggest paste is the larger of the two', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordPaste(40);
		b.recordPaste(12);
		await a.flush();
		await b.flush();
		assert.strictEqual(storedToday(store).biggestPasteLines, 40);
	});

	test('a window sees what another window saved without writing anything itself', async () => {
		const { context, writes } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordPaste(10);
		await a.flush();
		const before = writes.length;

		assert.strictEqual(b.snapshot().today.pastes, 1);
		assert.strictEqual(writes.length, before, 'reading must not write');
	});

	test('unsaved changes in one window survive when the other window saves first', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		b.recordPaste(10);
		a.recordPaste(10);
		await a.flush();

		assert.strictEqual(b.snapshot().today.pastes, 2, 'b shows its own unsaved paste plus a\'s');
		await b.flush();
		assert.strictEqual(storedToday(store).pastes, 2);
	});

	test('saving twice does not count anything twice', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		const b = open(context);
		a.recordPaste(10);
		await a.flush();
		a.recordPaste(10);
		await a.flush();
		await b.flush();
		await a.flush();
		assert.strictEqual(storedToday(store).pastes, 2);
	});

	test('edits made while a save is in flight are saved next time, not lost or doubled', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		a.recordPaste(10);
		const saving = a.flush();
		a.recordPaste(10);
		await saving;
		await a.flush();
		assert.strictEqual(storedToday(store).pastes, 2);
	});

	test('clearing in one window is not undone by a stale window', async () => {
		const { context, store } = fakeContext();
		const a = open(context);
		a.recordPaste(10); a.recordPaste(10); a.recordPaste(10);
		await a.flush();
		const b = open(context);
		assert.strictEqual(b.snapshot().today.pastes, 3);

		await a.clear();
		b.recordPaste(10);
		await b.flush();
		assert.strictEqual(storedToday(store).pastes, 1, 'only b\'s new paste, not the cleared history');
	});

	test('a window picks up another window\'s changes on its own and announces them', async () => {
		const { context } = fakeContext();
		const a = open(context);
		const b = open(context, { ...MANUAL, pullIntervalMs: 25 });
		let events = 0;
		b.onChanged(() => events++);

		a.recordPaste(10);
		await a.flush();
		await sleep(250);
		assert.strictEqual(events, 1, 'one update for one outside change');
		assert.strictEqual(b.snapshot().today.pastes, 1);
	});

	test('with no outside change nothing is announced', async () => {
		const { context } = fakeContext();
		const b = open(context, { ...MANUAL, pullIntervalMs: 25 });
		let events = 0;
		b.onChanged(() => events++);
		await sleep(150);
		assert.strictEqual(events, 0);
	});
});

suite('mergeDay and mergeStreak', () => {
	const day = (over: Partial<DayRecord>): DayRecord => ({ ...emptyDay('2026-06-22'), ...over });

	test('without a local copy the stored day is kept, as a copy', () => {
		const stored = day({ pastes: 4 });
		const out = mergeDay('2026-06-22', stored, undefined, undefined)!;
		assert.strictEqual(out.pastes, 4);
		assert.notStrictEqual(out, stored);
	});

	test('with nothing stored a new local day is kept whole', () => {
		const out = mergeDay('2026-06-22', undefined, day({ pastes: 2, pastedLines: 20, score: 90 }), undefined)!;
		assert.deepStrictEqual([out.pastes, out.pastedLines, out.score], [2, 20, 90]);
	});

	test('only our change since the last sync is added to what is stored', () => {
		const base = day({ pastes: 3, totalLinesAdded: 30, score: 85 });
		const current = day({ pastes: 4, totalLinesAdded: 40, score: 80 });
		const stored = day({ pastes: 5, totalLinesAdded: 52, score: 75 });
		const out = mergeDay('2026-06-22', stored, current, base)!;
		assert.deepStrictEqual([out.pastes, out.totalLinesAdded, out.score], [6, 62, 70]);
	});

	test('the score never goes below 0 or above 100', () => {
		const low = mergeDay('d', day({ score: 5 }), day({ score: 80 }), day({ score: 100 }))!;
		const high = mergeDay('d', day({ score: 99 }), day({ score: 100 }), day({ score: 50 }))!;
		assert.deepStrictEqual([low.score, high.score], [0, 100]);
	});

	test('the inputs are not modified', () => {
		const stored = day({ pastes: 1 });
		const current = day({ pastes: 2 });
		const base = day({ pastes: 1 });
		mergeDay('d', stored, current, base);
		assert.deepStrictEqual([stored.pastes, current.pastes, base.pastes], [1, 2, 1]);
	});

	test('the streak evaluated more recently wins and the best is kept', () => {
		const ours: StreakRecord = { current: 2, best: 5, lastEvaluated: '2026-06-21' };
		const stored: StreakRecord = { current: 3, best: 4, lastEvaluated: '2026-06-22' };
		assert.deepStrictEqual(mergeStreak(ours, stored), { current: 3, best: 5, lastEvaluated: '2026-06-22' });
	});

	test('an equal evaluation date keeps ours, and nothing stored keeps ours', () => {
		const ours: StreakRecord = { current: 2, best: 2, lastEvaluated: '2026-06-22' };
		assert.strictEqual(mergeStreak(ours, undefined), ours);
		assert.strictEqual(mergeStreak(ours, { current: 9, best: 9, lastEvaluated: '2026-06-22' }).current, 2);
	});
});
