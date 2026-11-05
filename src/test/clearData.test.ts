import * as assert from 'assert';
import { CadenceTracker } from '../detectors/cadenceTracker';
import { NudgeEngine } from '../nudge/nudgeEngine';
import { StatsService } from '../services/statsService';
import { STORAGE_KEYS } from '../constants';
import { fakeContext } from './fakeContext';

suite('clear data resets in-memory state', () => {
	test('NudgeEngine forgets history and snooze, and does not write them back', async () => {
		const { context, store } = fakeContext();
		const stats = new StatsService(context);
		const nudges = new NudgeEngine(context, stats);

		nudges.evaluate({ linesAdded: 5, isFastTyping: false, languageId: 'typescript', likelyOwnCode: false });
		nudges.snooze(30);
		assert.strictEqual(nudges.getStats().total, 1);

		await nudges.clear();
		assert.strictEqual(nudges.getStats().total, 0);
		assert.strictEqual(store.get(STORAGE_KEYS.nudgeHistory), undefined);
		assert.strictEqual(store.get(STORAGE_KEYS.snoozeUntil), undefined);

		nudges.dispose();
		assert.deepStrictEqual(store.get(STORAGE_KEYS.nudgeHistory), []);
		assert.strictEqual(store.get(STORAGE_KEYS.snoozeUntil), 0);
		stats.dispose();
	});

	test('NudgeEngine can nudge again right after clearing', async () => {
		const { context } = fakeContext();
		const stats = new StatsService(context);
		const nudges = new NudgeEngine(context, stats);
		const ctx = { linesAdded: 5, isFastTyping: false, languageId: 'typescript', likelyOwnCode: false };

		nudges.evaluate(ctx);
		nudges.evaluate(ctx);
		assert.strictEqual(nudges.getStats().total, 1, 'cooldown blocks the second nudge');

		await nudges.clear();
		nudges.evaluate(ctx);
		assert.strictEqual(nudges.getStats().total, 1, 'cooldown was reset by clear');
		nudges.dispose();
		stats.dispose();
	});

	test('CadenceTracker drops stored baselines', async () => {
		const baselines = { typescript: { medianMs: 120, madMs: 10, samples: 80, updatedAt: 1 } };
		const { context, store } = fakeContext({ [STORAGE_KEYS.cadenceBaselines]: baselines });
		const cadence = new CadenceTracker(context);

		await cadence.clear();
		cadence.flush();
		assert.strictEqual(store.get(STORAGE_KEYS.cadenceBaselines), undefined);
	});
});
