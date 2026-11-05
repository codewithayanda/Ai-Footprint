import * as assert from 'assert';
import { DayRecord, StreakRecord, emptyDay, rollStreak } from '../services/statsService';

const today = new Date(2026, 5, 22);

function day(date: string, totalLinesAdded: number, score: number): DayRecord {
	return { ...emptyDay(date), totalLinesAdded, score };
}

function roll(streak: Partial<StreakRecord>, days: DayRecord[]): StreakRecord {
	const start: StreakRecord = { current: 0, best: 0, lastEvaluated: '2026-06-18', ...streak };
	return rollStreak(start, new Map(days.map(d => [d.date, d])), today);
}

suite('rollStreak', () => {
	test('an empty day record does not extend the streak', () => {
		const out = roll({}, [day('2026-06-21', 0, 100)]);
		assert.strictEqual(out.current, 0);
	});

	test('an active clean day extends the streak and the best', () => {
		const out = roll({}, [day('2026-06-21', 10, 90)]);
		assert.deepStrictEqual([out.current, out.best], [1, 1]);
	});

	test('an active dirty day resets the streak but keeps the best', () => {
		const out = roll({ current: 3, best: 5 }, [day('2026-06-21', 10, 50)]);
		assert.deepStrictEqual([out.current, out.best], [0, 5]);
	});

	test('a missing day leaves the streak unchanged', () => {
		const out = roll({ current: 2, best: 2 }, []);
		assert.deepStrictEqual([out.current, out.best], [2, 2]);
	});

	test('a gap day between two clean days does not break the streak', () => {
		const out = roll({}, [day('2026-06-19', 5, 100), day('2026-06-21', 5, 100)]);
		assert.strictEqual(out.current, 2);
	});

	test('the first run only looks at yesterday', () => {
		const out = roll({ lastEvaluated: '' }, [day('2026-06-20', 5, 100), day('2026-06-21', 5, 100)]);
		assert.strictEqual(out.current, 1);
	});

	test('already evaluated today returns the same streak', () => {
		const start: StreakRecord = { current: 4, best: 4, lastEvaluated: '2026-06-22' };
		assert.strictEqual(rollStreak(start, new Map(), today), start);
	});

	test('lastEvaluated moves to today', () => {
		assert.strictEqual(roll({}, []).lastEvaluated, '2026-06-22');
	});

	test('the input streak is not mutated', () => {
		const start: StreakRecord = { current: 1, best: 1, lastEvaluated: '2026-06-18' };
		rollStreak(start, new Map([['2026-06-21', day('2026-06-21', 5, 100)]]), today);
		assert.deepStrictEqual(start, { current: 1, best: 1, lastEvaluated: '2026-06-18' });
	});
});
