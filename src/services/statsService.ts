import * as vscode from 'vscode';
import { STORAGE_KEYS, SCORING, PERSISTENCE } from '../constants';

export interface DayRecord {
	date: string;            // local yyyy-mm-dd
	score: number;
	pastes: number;
	nudges: number;
	pastedLines: number;
	totalLinesAdded: number; // typed + pasted
	biggestPasteLines: number;
	hourlyPastes: number[];  // 24 buckets, index = local hour
}

export interface StreakRecord {
	current: number;       // consecutive clean days up to yesterday
	best: number;
	lastEvaluated: string;
}

export interface DayAverage {
	score: number;
	pastes: number;
	reliance: number;
}

export interface SnapshotDeltas {
	scoreVsYesterday: number | null;
	pastesVsYesterday: number | null;
	scoreVs7dAvg: number | null;
	pastesVs7dAvg: number | null;
}

export interface SnapshotEvent {
	today: DayRecord;
	yesterday?: DayRecord;
	streak: StreakRecord;
	last7: DayRecord[];
	reliance: number;
	avg7: DayAverage | null; // prior 6 days, active days only
	deltas: SnapshotDeltas;
}

/** Owns per-day stats: persistence, midnight rollover, streak and the change event. */
export class StatsService implements vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<SnapshotEvent>();
	readonly onChanged = this.emitter.event;

	private days = new Map<string, DayRecord>();
	private streak: StreakRecord;
	private rolloverTimer?: NodeJS.Timeout;
	private emitTimer?: NodeJS.Timeout;
	private writeTimer?: NodeJS.Timeout;
	private unsaved = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly timing: { writeIntervalMs: number; emitDelayMs: number } = PERSISTENCE,
	) {
		const saved = context.globalState.get<DayRecord[]>(STORAGE_KEYS.dailyStats) ?? [];
		for (const d of saved) {
			// Backfill fields added after v0.1.0.
			if (!Array.isArray(d.hourlyPastes) || d.hourlyPastes.length !== 24) {
				d.hourlyPastes = new Array(24).fill(0);
			}
			if (typeof d.biggestPasteLines !== 'number') {
				d.biggestPasteLines = 0;
			}
			this.days.set(d.date, d);
		}
		this.streak = context.globalState.get<StreakRecord>(STORAGE_KEYS.streak)
			?? { current: 0, best: 0, lastEvaluated: '' };

		this.ensureTodayRecord();
		this.advanceStreakIfNeeded();
		this.scheduleMidnightRollover();
	}

	dispose(): void {
		void this.flush();
		if (this.emitTimer) {clearTimeout(this.emitTimer);}
		this.emitter.dispose();
		if (this.rolloverTimer) {clearTimeout(this.rolloverTimer);}
	}

	/** Writes pending changes now; awaited on deactivate. */
	async flush(): Promise<void> {
		if (this.writeTimer) {
			clearTimeout(this.writeTimer);
			this.writeTimer = undefined;
		}
		if (!this.unsaved) {return;}
		this.unsaved = false;
		await Promise.all([
			this.context.globalState.update(STORAGE_KEYS.dailyStats, [...this.days.values()]),
			this.context.globalState.update(STORAGE_KEYS.streak, this.streak),
		]);
	}

	/** The deduction is capped so one huge paste can't zero the day. */
	recordPaste(lines: number): void {
		const today = this.ensureTodayRecord();
		const deduction = Math.min(
			SCORING.maxDeductionPerPaste,
			Math.max(1, Math.floor(lines / SCORING.linesPerPoint))
		);
		today.pastes += 1;
		today.pastedLines += lines;
		today.totalLinesAdded += lines;
		today.score = Math.max(0, today.score - deduction);
		today.biggestPasteLines = Math.max(today.biggestPasteLines, lines);
		today.hourlyPastes[new Date().getHours()] += 1;
		this.markChanged();
	}

	recordTyping(lines: number): void {
		if (lines <= 0) {return;}
		const today = this.ensureTodayRecord();
		today.totalLinesAdded += lines;
		this.markChanged();
	}

	recordNudge(): void {
		const today = this.ensureTodayRecord();
		today.nudges += 1;
		this.markChanged();
	}

	async clear(): Promise<void> {
		this.days.clear();
		this.streak = { current: 0, best: 0, lastEvaluated: '' };
		this.ensureTodayRecord();
		this.unsaved = true;
		await this.flush();
		this.emitNow();
	}

	snapshot(): SnapshotEvent {
		const today = this.ensureTodayRecord();
		const yesterdayKey = isoDate(daysAgo(1));
		const yesterday = this.days.get(yesterdayKey);
		const last7 = this.lastNDays(7);

		const reliance = computeReliance(today);

		// Prior 6 active days only, so today and idle days don't skew the baseline.
		const priorSix = last7.slice(0, 6).filter(d => d.totalLinesAdded > 0);
		const avg7: DayAverage | null = priorSix.length > 0
			? {
				score: Math.round(priorSix.reduce((s, d) => s + d.score, 0) / priorSix.length),
				pastes: Math.round(priorSix.reduce((s, d) => s + d.pastes, 0) / priorSix.length),
				reliance: Math.round(priorSix.reduce((s, d) => s + computeReliance(d), 0) / priorSix.length),
			}
			: null;

		const deltas: SnapshotDeltas = {
			scoreVsYesterday: yesterday ? today.score - yesterday.score : null,
			pastesVsYesterday: yesterday ? today.pastes - yesterday.pastes : null,
			scoreVs7dAvg: avg7 ? today.score - avg7.score : null,
			pastesVs7dAvg: avg7 ? today.pastes - avg7.pastes : null,
		};

		return {
			today,
			yesterday,
			streak: { ...this.streak },
			last7,
			reliance,
			avg7,
			deltas,
		};
	}

	/** Oldest first; missing days are zeroed. */
	lastNDays(n: number): DayRecord[] {
		const out: DayRecord[] = [];
		for (let i = n - 1; i >= 0; i--) {
			const key = isoDate(daysAgo(i));
			out.push(this.days.get(key) ?? emptyDay(key));
		}
		return out;
	}

	private ensureTodayRecord(): DayRecord {
		const key = isoDate(new Date());
		let rec = this.days.get(key);
		if (!rec) {
			rec = emptyDay(key);
			this.days.set(key, rec);
			// Keep ~90 days.
			if (this.days.size > 90) {
				const keys = [...this.days.keys()].sort();
				for (const k of keys.slice(0, this.days.size - 90)) {this.days.delete(k);}
			}
		}
		return rec;
	}

	private advanceStreakIfNeeded(): void {
		this.streak = rollStreak(this.streak, this.days, new Date());
	}

	private scheduleMidnightRollover(): void {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
		this.rolloverTimer = setTimeout(() => {
			this.ensureTodayRecord();
			this.advanceStreakIfNeeded();
			this.markChanged();
			this.scheduleMidnightRollover();
		}, next.getTime() - now.getTime());
	}

	private markChanged(): void {
		this.unsaved = true;
		this.writeTimer ??= setTimeout(() => { void this.flush(); }, this.timing.writeIntervalMs);
		this.emitTimer ??= setTimeout(() => this.emitNow(), this.timing.emitDelayMs);
	}

	private emitNow(): void {
		if (this.emitTimer) {
			clearTimeout(this.emitTimer);
			this.emitTimer = undefined;
		}
		this.emitter.fire(this.snapshot());
	}
}

export function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function parseIso(s: string): Date {
	const [y, m, d] = s.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysAgo(n: number): Date {
	return addDays(new Date(), -n);
}

/** Folds every finished day since `lastEvaluated` into the streak; days without activity leave it unchanged. */
export function rollStreak(
	streak: StreakRecord,
	days: ReadonlyMap<string, DayRecord>,
	today: Date,
): StreakRecord {
	const todayKey = isoDate(today);
	if (streak.lastEvaluated === todayKey) {return streak;}

	const yesterday = addDays(today, -1);
	const startFrom = streak.lastEvaluated ? addDays(parseIso(streak.lastEvaluated), 1) : yesterday;
	const next = { ...streak, lastEvaluated: todayKey };

	for (let d = startFrom; d <= yesterday; d = addDays(d, 1)) {
		const rec = days.get(isoDate(d));
		if (!rec || rec.totalLinesAdded === 0) {continue;}
		if (rec.score >= SCORING.cleanDayThreshold) {
			next.current += 1;
			next.best = Math.max(next.best, next.current);
		} else {
			next.current = 0;
		}
	}
	return next;
}

export function emptyDay(date: string): DayRecord {
	return {
		date,
		score: SCORING.startingScore,
		pastes: 0,
		nudges: 0,
		pastedLines: 0,
		totalLinesAdded: 0,
		biggestPasteLines: 0,
		hourlyPastes: new Array(24).fill(0),
	};
}

/** Percent of the day's lines that arrived via paste. */
export function computeReliance(d: DayRecord): number {
	return d.totalLinesAdded > 0
		? Math.min(100, Math.round((d.pastedLines / d.totalLinesAdded) * 100))
		: 0;
}
