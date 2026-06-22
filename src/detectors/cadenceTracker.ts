import * as vscode from 'vscode';

interface TypingEvent {
	timestamp: number;
	linesAdded: number;
	charsAdded: number;
}

interface UserBaseline {
	avgIntervalMs: number;
	totalSessions: number;
	lastUpdated: number;
}

export class CadenceTracker {
	private typingHistory: TypingEvent[] = [];
	private lastKeystrokeTime: number = 0;
	private intervals: number[] = [];
	private context: vscode.ExtensionContext;

	// How many intervals we keep in memory
	private readonly MAX_INTERVALS = 100;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	// Called every time a text change happens
	public track(linesAdded: number, charsAdded: number): void {
		const now = Date.now();

		// Only track single character additions (actual typing)
		// not pastes (we handle those separately)
		if (charsAdded <= 2 && this.lastKeystrokeTime !== 0) {
			const interval = now - this.lastKeystrokeTime;

			// Ignore intervals over 5 seconds (user was just thinking/pausing)
			if (interval < 5000) {
				this.intervals.push(interval);

				// Keep only the last N intervals
				if (this.intervals.length > this.MAX_INTERVALS) {
					this.intervals.shift();
				}
			}
		}

		this.lastKeystrokeTime = now;

		// Save a typing event
		this.typingHistory.push({ timestamp: now, linesAdded, charsAdded });

		// Update the baseline every 50 keystrokes
		if (this.intervals.length > 0 && this.intervals.length % 50 === 0) {
			this.saveBaseline();
		}
	}

	// Calculate average interval between keystrokes
	public getAverageInterval(): number {
		if (this.intervals.length === 0) return 0;
		const sum = this.intervals.reduce((a, b) => a + b, 0);
		return sum / this.intervals.length;
	}

	// Save baseline to persistent storage
	private saveBaseline(): void {
		const baseline: UserBaseline = {
			avgIntervalMs: this.getAverageInterval(),
			totalSessions: (this.getBaseline()?.totalSessions || 0) + 1,
			lastUpdated: Date.now()
		};
		this.context.globalState.update('userBaseline', baseline);
		console.log('Baseline saved:', baseline);
	}

	// Get saved baseline from storage
	public getBaseline(): UserBaseline | undefined {
		return this.context.globalState.get<UserBaseline>('userBaseline');
	}

	// Check if current typing speed is suspiciously fast
	public isSuspiciouslyFast(): boolean {
		const baseline = this.getBaseline();
		const currentAvg = this.getAverageInterval();

		// Not enough data yet to compare
		if (!baseline || this.intervals.length < 10) return false;

		// If current speed is 3x faster than their baseline — suspicious
		return currentAvg < baseline.avgIntervalMs / 3;
	}
}