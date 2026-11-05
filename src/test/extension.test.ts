import * as assert from 'assert';
import { median, medianAbsoluteDeviation } from '../detectors/cadenceTracker';
import { countLines, countNewlines } from '../detectors/pasteDetector';
import { isoDate, parseIso, addDays, daysAgo, emptyDay } from '../services/statsService';
import { SCORING } from '../constants';

suite('cadence stats', () => {
	test('median: odd length', () => assert.strictEqual(median([3, 1, 2]), 2));
	test('median: even length', () => assert.strictEqual(median([4, 1, 2, 3]), 2.5));
	test('median: empty', () => assert.strictEqual(median([]), 0));
	test('MAD is robust to outliers', () => {
		const base = [100, 101, 99, 100, 102, 98];
		const withOutlier = [...base, 10_000];
		assert.ok(medianAbsoluteDeviation(withOutlier) < 5,
			'a single huge outlier should not move the MAD much');
	});
});

suite('paste line counting', () => {
	test('empty string is 0 lines', () => assert.strictEqual(countLines(''), 0));
	test('single line, no trailing newline', () => assert.strictEqual(countLines('abc'), 1));
	test('two lines without trailing newline', () => assert.strictEqual(countLines('a\nb'), 2));
	test('two lines with trailing newline', () => assert.strictEqual(countLines('a\nb\n'), 2));
	test('three lines mixed', () => assert.strictEqual(countLines('a\nb\nc'), 3));
});

suite('typed line counting', () => {
	test('empty string adds 0 lines', () => assert.strictEqual(countNewlines(''), 0));
	test('a typed character adds 0 lines', () => assert.strictEqual(countNewlines('a'), 0));
	test('typing 200 characters adds 0 lines', () => assert.strictEqual(countNewlines('x'.repeat(200)), 0));
	test('Enter adds 1 line', () => assert.strictEqual(countNewlines('\n'), 1));
	test('Enter with auto-indent still adds 1 line', () => assert.strictEqual(countNewlines('\n    '), 1));
	test('Enter with tab auto-indent still adds 1 line', () => assert.strictEqual(countNewlines('\n\t\t'), 1));
	test('CRLF counts once', () => assert.strictEqual(countNewlines('\r\n'), 1));
	test('multi-line text counts each break', () => assert.strictEqual(countNewlines('a\nb\nc\n'), 3));
	test('differs from countLines for a single character', () => {
		assert.strictEqual(countLines('a'), 1);
		assert.strictEqual(countNewlines('a'), 0);
	});
});

suite('date helpers', () => {
	test('isoDate round-trips through parseIso', () => {
		const d = new Date(2026, 5, 22); // local time
		assert.strictEqual(isoDate(parseIso(isoDate(d))), isoDate(d));
	});
	test('addDays handles month boundary', () => {
		const d = new Date(2026, 0, 31); // Jan 31
		assert.strictEqual(isoDate(addDays(d, 1)), '2026-02-01');
	});
	test('daysAgo(0) is today', () => {
		assert.strictEqual(isoDate(daysAgo(0)), isoDate(new Date()));
	});
});

suite('day record', () => {
	test('emptyDay starts at the configured score', () => {
		const d = emptyDay('2026-06-22');
		assert.strictEqual(d.score, SCORING.startingScore);
		assert.strictEqual(d.pastes, 0);
		assert.strictEqual(d.nudges, 0);
		assert.strictEqual(d.pastedLines, 0);
		assert.strictEqual(d.totalLinesAdded, 0);
	});
});
