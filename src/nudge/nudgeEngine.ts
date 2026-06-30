import * as vscode from 'vscode';
import { getSettings } from '../config/settings';
import { NUDGE, STORAGE_KEYS } from '../constants';
import type { StatsService } from '../services/statsService';

type NudgeLevel = 'subtle' | 'warning' | 'strong';

interface NudgeRecord {
	timestamp: number;
	level: NudgeLevel;
	linesAffected: number;
	languageId: string;
}

export interface NudgeContext {
	linesAdded: number;
	isFastTyping: boolean;
	languageId: string;
	likelyOwnCode: boolean;
}

/**
 * Decides whether to nudge, at what severity, and shows the appropriate UI.
 *
 * Two ideas worth calling out:
 *  1. Snooze is represented as an explicit `snoozeUntil` timestamp, never as
 *     "fake the lastNudgeTime in the future". That bug bit the previous version.
 *  2. We never nudge while a debug session is active (configurable), because
 *     nudging during a bug hunt is exactly what makes people uninstall the extension.
 */
export class NudgeEngine implements vscode.Disposable {
	private history: NudgeRecord[] = [];
	private lastNudgeAt = 0;
	private snoozeUntil = 0;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly stats: StatsService,
	) {
		this.history = context.globalState.get<NudgeRecord[]>(STORAGE_KEYS.nudgeHistory) ?? [];
		this.snoozeUntil = context.globalState.get<number>(STORAGE_KEYS.snoozeUntil) ?? 0;
	}

	dispose(): void {
		this.persist();
	}

	evaluate(ctx: NudgeContext): void {
		const { enabled, cooldownMinutes, quietWhileDebugging } = getSettings();
		if (!enabled) {return;}
		if (quietWhileDebugging && vscode.debug.activeDebugSession) {return;}

		const now = Date.now();
		if (now < this.snoozeUntil) {return;}
		if (now - this.lastNudgeAt < cooldownMinutes * 60_000) {return;}

		const shouldNudge = ctx.linesAdded >= NUDGE.subtleLines || ctx.isFastTyping;
		if (!shouldNudge) {return;}

		// Don't nudge for code the user clearly authored locally.
		if (ctx.likelyOwnCode && !ctx.isFastTyping) {return;}

		const level = this.classify(ctx.linesAdded, ctx.isFastTyping);
		this.fire(level, ctx);

		this.lastNudgeAt = now;
		this.history.push({
			timestamp: now,
			level,
			linesAffected: ctx.linesAdded,
			languageId: ctx.languageId,
		});
		if (this.history.length > 200) {this.history = this.history.slice(-200);}
		this.stats.recordNudge();
		this.persist();
	}

	snooze(minutes: number): void {
		this.snoozeUntil = Date.now() + minutes * 60_000;
		void this.context.globalState.update(STORAGE_KEYS.snoozeUntil, this.snoozeUntil);
		vscode.window.setStatusBarMessage(
			`$(bell-slash) AI Footprint: snoozed for ${minutes} minutes`,
			5_000,
		);
	}

	getStats(): { total: number; byLevel: Record<NudgeLevel, number> } {
		const byLevel: Record<NudgeLevel, number> = { subtle: 0, warning: 0, strong: 0 };
		for (const n of this.history) {byLevel[n.level]++;}
		return { total: this.history.length, byLevel };
	}

	private classify(lines: number, fast: boolean): NudgeLevel {
		if (lines >= NUDGE.strongLines) {return 'strong';}
		if (lines >= NUDGE.warningLines || fast) {return 'warning';}
		return 'subtle';
	}

	private fire(level: NudgeLevel, ctx: NudgeContext): void {
		const tail = ctx.languageId ? ` (${ctx.languageId})` : '';
		switch (level) {
			case 'subtle':
				vscode.window.setStatusBarMessage(
					`$(eye) AI Footprint: review what you just added${tail}.`,
					NUDGE.statusBarMs,
				);
				return;
			case 'warning':
				void vscode.window
					.showWarningMessage(
						`AI Footprint: ${ctx.linesAdded} lines added at once${tail}. Do you understand what this code does?`,
						'Got it',
						`Snooze ${NUDGE.snoozeMinutes}m`,
					)
					.then(choice => {
						if (choice === `Snooze ${NUDGE.snoozeMinutes}m`) {this.snooze(NUDGE.snoozeMinutes);}
					});
				return;
			case 'strong':
				void vscode.window
					.showErrorMessage(
						`AI Footprint: ${ctx.linesAdded} lines added at once${tail}. Review this carefully before moving on.`,
						'I will review it',
						`Snooze ${NUDGE.snoozeMinutes}m`,
					)
					.then(choice => {
						if (choice === `Snooze ${NUDGE.snoozeMinutes}m`) {this.snooze(NUDGE.snoozeMinutes);}
					});
		}
	}

	private persist(): void {
		void this.context.globalState.update(STORAGE_KEYS.nudgeHistory, this.history);
		void this.context.globalState.update(STORAGE_KEYS.snoozeUntil, this.snoozeUntil);
	}
}
