import * as assert from 'assert';
import { nudgeMessage } from '../nudge/nudgeEngine';

const ctx = (linesAdded: number, isFastTyping = false, languageId = 'typescript') =>
	({ linesAdded, isFastTyping, languageId, likelyOwnCode: false });

suite('nudgeMessage', () => {
	test('fast typing with no real paste does not claim lines were added at once', () => {
		const msg = nudgeMessage('warning', ctx(0, true));
		assert.ok(msg.includes('faster than you usually type'));
		assert.ok(!msg.includes('lines added'));
	});

	test('a large paste reports the line count', () => {
		assert.ok(nudgeMessage('warning', ctx(20)).includes('20 lines added at once'));
	});

	test('fast typing during a large paste still reports the line count', () => {
		assert.ok(nudgeMessage('warning', ctx(20, true)).includes('20 lines added at once'));
	});

	test('the strong level asks for a careful review', () => {
		assert.ok(nudgeMessage('strong', ctx(40)).includes('Review this carefully'));
	});

	test('the subtle level is a short review reminder', () => {
		assert.ok(nudgeMessage('subtle', ctx(6)).includes('review what you just added'));
	});

	test('the language is shown when known and left out when empty', () => {
		assert.ok(nudgeMessage('warning', ctx(20)).includes('(typescript)'));
		assert.ok(!nudgeMessage('warning', ctx(20, false, '')).includes('()'));
	});
});
