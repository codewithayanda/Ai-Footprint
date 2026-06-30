import * as vscode from 'vscode';
import { STORAGE_KEYS, SCORING } from '../constants';

export interface DayRecord {
	date: string;            // ISO yyyy-mm-dd in local time
	score: number;           // 0..100
	pastes: number;
	nudges: number;
	pastedLines: number;     // total lines that arrived via paste-class events
	totalLinesAdded: number; // every line added today (typed + pasted)
	biggestPasteLines: number; // max lines in a single paste today
	hourlyPastes: number[];  // length 24; hourlyPastes[h] = pastes during local hour h
}

export interface StreakRecord {
	current: number;       // consecutive clean days up to and including yesterday
	best: number;
	lastEvaluated: string; // ISO date we last rolled the streak forward
}

/** Aggregate over a window of past days. Null when no day in the window had activity. */
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
	reliance: number;        // today's reliance %, derived from today's record
	avg7: DayAverage | null; // average over the 6 days BEFORE today, active days only
	deltas: SnapshotDeltas;
}

/**
 * Owns all session-spanning stats. Persists per-day records keyed by local date,
 * handles rollover at midnight, computes the clean-day streak, and emits a single
 * event consumers (dashboard, status bar) can subscribe to.
 */
export class StatsService implements vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<SnapshotEvent>();
	readonly onChanged = this.emitter.event;

	private days = new Map<string, DayRecord>();
	private streak: StreakRecord;
	private rolloverTimer?: NodeJS.Timeout;

	constructor(private readonly context: vscode.ExtensionContext) {
		const saved = context.globalState.get<DayRecord[]>(STORAGE_KEYS.dailyStats) ?? [];
		for (const d of saved) {
			// Backfill fields added after v0.1.0 so older records load cleanly.
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
		this.emitter.dispose();
		if (this.rolloverTimer) {clearTimeout(this.rolloverTimer);}
	}

	// --- Mutations -----------------------------------------------------------

	/** Record a paste of `lines` lines. Caps deduction to avoid score collapse from a single huge paste. */
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
		this.persistAndEmit();
	}

	/** Record lines added through normal typing (no paste). */
	recordTyping(lines: number): void {
		if (lines <= 0) {return;}
		const today = this.ensureTodayRecord();
		today.totalLinesAdded += lines;
		// No score change for typing; just emit so the dashboard's reliance % stays live.
		this.persistAndEmit();
	}

	recordNudge(): void {
		const today = this.ensureTodayRecord();
		today.nudges += 1;
		this.persistAndEmit();
	}

	/** Wipe all persisted state. Used by the "Clear Data" command. */
	async clear(): Promise<void> {
		this.days.clear();
		this.streak = { current: 0, best: 0, lastEvaluated: '' };
		await this.context.globalState.update(STORAGE_KEYS.dailyStats, undefined);
		await this.context.globalState.update(STORAGE_KEYS.streak, undefined);
		this.ensureTodayRecord();
		this.persistAndEmit();
	}

	// --- Queries -------------------------------------------------------------

	snapshot(): SnapshotEvent {
		const today = this.ensureTodayRecord();
		const yesterdayKey = isoDate(daysAgo(1));
		const yesterday = this.days.get(yesterdayKey);
		const last7 = this.lastNDays(7);

		const reliance = computeReliance(today);

		// Average over the 6 days BEFORE today, counting only days with real activity.
		// Including today would make today partially define its own baseline; including
		// zero-activity days would inflate the average upward and make today look worse.
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

	/** Last N days oldest-first, filling missing days with zeroed records. */
	lastNDays(n: number): DayRecord[] {
		const out: DayRecord[] = [];
		for (let i = n - 1; i >= 0; i--) {
			const key = isoDate(daysAgo(i));
			out.push(this.days.get(key) ?? emptyDay(key));
		}
		return out;
	}

	// --- Internals -----------------------------------------------------------

	private ensureTodayRecord(): DayRecord {
		const key = isoDate(new Date());
		let rec = this.days.get(key);
		if (!rec) {
			rec = emptyDay(key);
			this.days.set(key, rec);
			// Trim history to ~90 days.
			if (this.days.size > 90) {
				const keys = [...this.days.keys()].sort();
				for (const k of keys.slice(0, this.days.size - 90)) {this.days.delete(k);}
			}
		}
		return rec;
	}

	/**
	 * If the day has changed since we last evaluated, fold any completed days
	 * into the streak. Pure function over `this.days` + `this.streak`.
	 */
	private advanceStreakIfNeeded(): void {
		const todayKey = isoDate(new Date());
		if (this.streak.lastEvaluated === todayKey) {return;}

		// Walk forward from lastEvaluated + 1 up to yesterday.
		const startFrom = this.streak.lastEvaluated
			? addDays(parseIso(this.streak.lastEvaluated), 1)
			: addDays(new Date(), -1); // first run: just consider yesterday

		const yesterday = addDays(new Date(), -1);
		for (let d = startFrom; d <= yesterday; d = addDays(d, 1)) {
			const rec = this.days.get(isoDate(d));
			// A "clean day" requires we actually saw activity that day.
			const clean = !!rec && rec.score >= SCORING.cleanDayThreshold;
			if (clean) {
				this.streak.current += 1;
				if (this.streak.current > this.streak.best) {this.streak.best = this.streak.current;}
			} else if (rec) {
				this.streak.current = 0; // a tracked-but-not-clean day breaks the streak
			}
			// If !rec (no activity that day), we leave the streak unchanged.
		}
		this.streak.lastEvaluated = todayKey;
	}

	private scheduleMidnightRollover(): void {
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
		this.rolloverTimer = setTimeout(() => {
			this.ensureTodayRecord();
			this.advanceStreakIfNeeded();
			this.persistAndEmit();
			this.scheduleMidnightRollover();
		}, next.getTime() - now.getTime());
	}

	private persistAndEmit(): void {
		void this.context.globalState.update(STORAGE_KEYS.dailyStats, [...this.days.values()]);
		void this.context.globalState.update(STORAGE_KEYS.streak, this.streak);
		this.emitter.fire(this.snapshot());
	}
}

// --- Pure helpers (exported for tests) --------------------------------------

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

/** Pure: fraction of lines added that day which arrived via paste. */
export function computeReliance(d: DayRecord): number {
	return d.totalLinesAdded > 0
		? Math.min(100, Math.round((d.pastedLines / d.totalLinesAdded) * 100))
		: 0;
}
