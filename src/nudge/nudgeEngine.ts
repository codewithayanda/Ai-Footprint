import * as vscode from 'vscode';

type NudgeLevel = 'subtle' | 'warning' | 'strong';

interface NudgeRecord {
	timestamp: number;
	level: NudgeLevel;
	linesAffected: number;
}

export class NudgeEngine {
	private lastNudgeTime: number = 0;
	private nudgeHistory: NudgeRecord[] = [];
	private context: vscode.ExtensionContext;

	// Cooldown between nudges in milliseconds (5 minutes)
	private readonly COOLDOWN_MS = 1 * 60 * 1000;

	// How many lines before we escalate the nudge level
	private readonly SUBTLE_THRESHOLD = 5;
	private readonly WARNING_THRESHOLD = 15;
	private readonly STRONG_THRESHOLD = 30;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	// Main method — decides whether and how to nudge
	public evaluate(linesAdded: number, isFastTyping: boolean): void {
		const now = Date.now();
		const timeSinceLastNudge = now - this.lastNudgeTime;

		// Respect the cooldown — don't nudge if we just did
		if (timeSinceLastNudge < this.COOLDOWN_MS) {
			console.log('Nudge skipped — cooldown active');
			return;
		}

		// Decide if we should nudge at all
		const shouldNudge = linesAdded >= this.SUBTLE_THRESHOLD || isFastTyping;
		if (!shouldNudge) return;

		// Decide nudge level based on severity
		const level = this.getNudgeLevel(linesAdded, isFastTyping);

		// Fire the nudge
		this.fireNudge(level, linesAdded);

		// Record it
		this.lastNudgeTime = now;
		this.nudgeHistory.push({ timestamp: now, level, linesAffected: linesAdded });

		// Save history to persistent storage
		this.saveHistory();
	}

	// Determine how severe the nudge should be
	private getNudgeLevel(linesAdded: number, isFastTyping: boolean): NudgeLevel {
		if (linesAdded >= this.STRONG_THRESHOLD) return 'strong';
		if (linesAdded >= this.WARNING_THRESHOLD || isFastTyping) return 'warning';
		return 'subtle';
	}

	// Fire the actual nudge based on level
	private fireNudge(level: NudgeLevel, linesAdded: number): void {
		switch (level) {
			case 'subtle':
				vscode.window.setStatusBarMessage(
					'$(eye) AI Footprint: Take a moment to review what you just added.',
					8000 // disappears after 8 seconds
				);
				break;

			case 'warning':
				vscode.window.showWarningMessage(
					`AI Footprint: You added ${linesAdded} lines at once. Do you understand what this code does?`,
					'Got it', 'Snooze 30min'
				).then(selection => {
					if (selection === 'Snooze 30min') {
						this.snooze(30);
					}
				});
				break;

			case 'strong':
				vscode.window.showErrorMessage(
					`AI Footprint: ${linesAdded} lines added at once — that's a lot! Consider reviewing this carefully before moving on.`,
					'I will review it', 'Snooze 30min'
				).then(selection => {
					if (selection === 'Snooze 30min') {
						this.snooze(30);
					}
				});
				break;
		}

		console.log(`Nudge fired — level: ${level}, lines: ${linesAdded}`);
	}

	// Snooze nudges for X minutes
	private snooze(minutes: number): void {
		this.lastNudgeTime = Date.now() + (minutes * 60 * 1000);
		vscode.window.setStatusBarMessage(
			`$(bell-slash) AI Footprint: Snoozed for ${minutes} minutes`,
			5000
		);
		console.log(`Nudges snoozed for ${minutes} minutes`);
	}

	// Get nudge stats for the dashboard later
	public getStats(): { total: number; byLevel: Record<NudgeLevel, number> } {
		return {
			total: this.nudgeHistory.length,
			byLevel: {
				subtle: this.nudgeHistory.filter(n => n.level === 'subtle').length,
				warning: this.nudgeHistory.filter(n => n.level === 'warning').length,
				strong: this.nudgeHistory.filter(n => n.level === 'strong').length,
			}
		};
	}

	// Save history to globalState
	private saveHistory(): void {
		// Keep only last 100 nudges
		const trimmed = this.nudgeHistory.slice(-100);
		this.context.globalState.update('nudgeHistory', trimmed);
	}

	// Load history from globalState
	public loadHistory(): void {
		const saved = this.context.globalState.get<NudgeRecord[]>('nudgeHistory');
		if (saved) {
			this.nudgeHistory = saved;
			console.log('Nudge history loaded:', saved.length, 'records');
		}
	}
}