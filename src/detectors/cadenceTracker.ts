import * as vscode from 'vscode';
import { CADENCE, STORAGE_KEYS } from '../constants';

export interface LanguageBaseline {
	medianMs: number;
	madMs: number;
	samples: number;
	updatedAt: number;
}

interface PersistedBaselines {
	[languageId: string]: LanguageBaseline;
}

/**
 * Tracks typing rhythm per language and flags bursts much faster than the stored baseline.
 * Edits longer than a keystroke (paste, snippet, autocomplete) never enter the window.
 */
export class CadenceTracker {
	private intervalsByLang = new Map<string, number[]>();
	private lastKeystrokeByLang = new Map<string, number>();
	private sinceBaselineUpdate = new Map<string, number>();
	private baselines: PersistedBaselines;
	private dirty = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly clock: () => number = Date.now,
	) {
		this.baselines = context.globalState.get<PersistedBaselines>(STORAGE_KEYS.cadenceBaselines) ?? {};
	}

	async clear(): Promise<void> {
		this.intervalsByLang.clear();
		this.lastKeystrokeByLang.clear();
		this.sinceBaselineUpdate.clear();
		this.baselines = {};
		this.dirty = false;
		await this.context.globalState.update(STORAGE_KEYS.cadenceBaselines, undefined);
	}

	track(languageId: string, charsAdded: number, charsRemoved: number): void {
		const now = this.clock();
		const isLikelyKeystroke = charsAdded > 0 && charsAdded <= CADENCE.maxCharsPerKeystroke;
		const isBackspace = charsAdded === 0 && charsRemoved > 0 && charsRemoved <= CADENCE.maxCharsPerKeystroke;

		if (!isLikelyKeystroke && !isBackspace) {
			// The next keystroke would otherwise measure its interval from before the paste.
			this.lastKeystrokeByLang.delete(languageId);
			return;
		}

		const prev = this.lastKeystrokeByLang.get(languageId);
		this.lastKeystrokeByLang.set(languageId, now);
		if (prev === undefined || !isLikelyKeystroke) {return;}

		const interval = now - prev;
		if (interval < CADENCE.minIntervalMs || interval > CADENCE.maxIntervalMs) {return;}

		const arr = this.intervalsByLang.get(languageId) ?? [];
		arr.push(interval);
		if (arr.length > CADENCE.windowSize) {arr.shift();}
		this.intervalsByLang.set(languageId, arr);

		const count = (this.sinceBaselineUpdate.get(languageId) ?? 0) + 1;
		this.sinceBaselineUpdate.set(languageId, count);

		// A fast window must not drag the baseline down toward itself.
		if (
			count >= CADENCE.baselineUpdateEvery
			&& arr.length >= CADENCE.minSamplesForBaseline
			&& !this.isSuspiciouslyFast(languageId)
		) {
			this.updateBaseline(languageId, arr);
			this.sinceBaselineUpdate.set(languageId, 0);
		}
	}

	isSuspiciouslyFast(languageId: string): boolean {
		const baseline = this.baselines[languageId];
		return !!baseline && isFasterThanBaseline(this.intervalsByLang.get(languageId) ?? [], baseline.medianMs);
	}

	flush(): void {
		if (this.dirty) {
			void this.context.globalState.update(STORAGE_KEYS.cadenceBaselines, this.baselines);
			this.dirty = false;
		}
	}

	private updateBaseline(languageId: string, intervals: number[]): void {
		this.baselines[languageId] = blendBaseline(this.baselines[languageId], intervals, this.clock());
		this.dirty = true;
		this.flush();
	}
}

/** Compares the most recent third of the window to the baseline, so a fresh burst stands out. */
export function isFasterThanBaseline(intervals: number[], baselineMedianMs: number): boolean {
	if (intervals.length < CADENCE.minSamplesForBaseline) {return false;}
	const recent = intervals.slice(-Math.max(10, Math.floor(intervals.length / 3)));
	const current = median(recent);
	return current > 0 && current * CADENCE.fastMultiplier < baselineMedianMs;
}

/** Moves the stored baseline part of the way toward the window median; the first baseline is the median itself. */
export function blendBaseline(
	prev: LanguageBaseline | undefined,
	intervals: number[],
	now: number,
): LanguageBaseline {
	const m = median(intervals);
	const w = CADENCE.baselineWeight;
	return {
		medianMs: prev ? Math.round(prev.medianMs * (1 - w) + m * w) : m,
		madMs: medianAbsoluteDeviation(intervals, m),
		samples: intervals.length,
		updatedAt: now,
	};
}

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
