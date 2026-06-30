import * as vscode from 'vscode';
import { CADENCE, STORAGE_KEYS } from '../constants';

interface LanguageBaseline {
	medianMs: number;
	madMs: number;      // median absolute deviation: a robust measure of spread
	samples: number;
	updatedAt: number;
}

interface PersistedBaselines {
	[languageId: string]: LanguageBaseline;
}

/**
 * Tracks the user's typing rhythm per language and exposes a single
 * `isSuspiciouslyFast` signal. Uses median + MAD rather than mean +
 * stdev so a few long pauses or instant accepts don't poison the baseline.
 *
 * Intentionally ignores edits whose `charsAdded` exceeds the configured
 * keystroke cutoff. Those are pastes, snippet expansions, or autocomplete
 * acceptances and must not enter the baseline.
 */
export class CadenceTracker {
	private intervalsByLang = new Map<string, number[]>();
	private lastKeystrokeByLang = new Map<string, number>();
	private baselines: PersistedBaselines;
	private dirty = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.baselines = context.globalState.get<PersistedBaselines>(STORAGE_KEYS.cadenceBaselines) ?? {};
	}

	track(languageId: string, charsAdded: number, charsRemoved: number): void {
		// Non-keystroke edits never feed the baseline. Backspaces (removed > 0,
		// added 0) are evidence of human editing but don't have a meaningful
		// inter-keystroke interval, so we just refresh the timestamp.
		const now = Date.now();
		const isLikelyKeystroke = charsAdded > 0 && charsAdded <= CADENCE.maxCharsPerKeystroke;
		const isBackspace = charsAdded === 0 && charsRemoved > 0 && charsRemoved <= CADENCE.maxCharsPerKeystroke;

		if (!isLikelyKeystroke && !isBackspace) {
			// Big insertion (paste / autocomplete): reset the last-keystroke timer
			// so the next genuine keystroke doesn't compute a bogus interval.
			this.lastKeystrokeByLang.delete(languageId);
			return;
		}

		const prev = this.lastKeystrokeByLang.get(languageId);
		this.lastKeystrokeByLang.set(languageId, now);
		if (prev === undefined || !isLikelyKeystroke) {return;}

		const interval = now - prev;
		if (interval <= 0 || interval > CADENCE.maxIntervalMs) {return;}

		const arr = this.intervalsByLang.get(languageId) ?? [];
		arr.push(interval);
		if (arr.length > CADENCE.windowSize) {arr.shift();}
		this.intervalsByLang.set(languageId, arr);

		// Update baselines periodically.
		if (arr.length >= CADENCE.minSamplesForBaseline && arr.length % 25 === 0) {
			this.updateBaseline(languageId, arr);
		}
	}

	isSuspiciouslyFast(languageId: string): boolean {
		const arr = this.intervalsByLang.get(languageId) ?? [];
		if (arr.length < CADENCE.minSamplesForBaseline) {return false;}

		const baseline = this.baselines[languageId];
		if (!baseline) {return false;}

		// Use the most recent third of the window as the "current" tempo so a
		// recent burst stands out against the baseline median.
		const recent = arr.slice(-Math.max(10, Math.floor(arr.length / 3)));
		const currentMedian = median(recent);

		return currentMedian > 0 && currentMedian * CADENCE.fastMultiplier < baseline.medianMs;
	}

	flush(): void {
		if (this.dirty) {
			void this.context.globalState.update(STORAGE_KEYS.cadenceBaselines, this.baselines);
			this.dirty = false;
		}
	}

	private updateBaseline(languageId: string, intervals: number[]): void {
		const m = median(intervals);
		const mad = medianAbsoluteDeviation(intervals, m);
		this.baselines[languageId] = {
			medianMs: m,
			madMs: mad,
			samples: intervals.length,
			updatedAt: Date.now(),
		};
		this.dirty = true;
		this.flush();
	}
}

// --- Pure stats helpers (exported for tests) -------------------------------

export function median(values: number[]): number {
	if (values.length === 0) {return 0;}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function medianAbsoluteDeviation(values: number[], med = median(values)): number {
	if (values.length === 0) {return 0;}
	return median(values.map(v => Math.abs(v - med)));
}
