import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';
import { PasteDetector, countLines } from './detectors/pasteDetector';
import { NudgeEngine } from './nudge/nudgeEngine';
import { StatsService } from './services/statsService';
import { DashboardPanel } from './ui/dashboardPanel';
import { getSettings, onSettingsChanged } from './config/settings';
import { STORAGE_KEYS } from './constants';

export function activate(context: vscode.ExtensionContext): void {
	const stats = new StatsService(context);
	const cadence = new CadenceTracker(context);
	const nudges = new NudgeEngine(context, stats);
	const paste = new PasteDetector(getSettings().clipboardAware);

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = 'ai-footprint.showDashboard';
	statusBar.tooltip = 'AI Footprint · click to open dashboard';
	updateStatusBar(statusBar, stats, getSettings().showStatusBar);

	context.subscriptions.push(
		stats,
		nudges,
		statusBar,
		stats.onChanged(() => updateStatusBar(statusBar, stats, getSettings().showStatusBar)),
		registerCommands(context, stats, nudges),
		onSettingsChanged(s => {
			updateStatusBar(statusBar, stats, s.showStatusBar);
			vscode.window.setStatusBarMessage(
				s.enabled
					? '$(eye) AI Footprint: monitoring enabled'
					: '$(eye-closed) AI Footprint: monitoring disabled',
				3_000,
			);
		}),
		vscode.workspace.onDidChangeTextDocument(e => handleDocChange(e, { stats, cadence, nudges, paste })),
	);

	maybeShowOnboarding(context);
}

export function deactivate(): void { /* disposables handle cleanup */ }

// --- Wiring helpers --------------------------------------------------------

interface Deps {
	stats: StatsService;
	cadence: CadenceTracker;
	nudges: NudgeEngine;
	paste: PasteDetector;
}

function handleDocChange(event: vscode.TextDocumentChangeEvent, deps: Deps): void {
	const { enabled, pasteThreshold } = getSettings();
	if (!enabled) {return;}

	// We don't care about settings.json, output channels, etc.
	if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled') {return;}

	for (const change of event.contentChanges) {
		const text = change.text;
		const linesAdded = countLines(text);
		const charsAdded = text.length;
		const charsRemoved = change.rangeLength;
		const languageId = event.document.languageId;

		deps.cadence.track(languageId, charsAdded, charsRemoved);

		if (linesAdded >= pasteThreshold) {
			// Defer to PasteDetector for full classification (clipboard match etc.)
			void deps.paste
				.classify(text, event.document)
				.then(signal => {
					deps.stats.recordPaste(signal.lines);
					deps.nudges.evaluate({
						linesAdded: signal.lines,
						isFastTyping: deps.cadence.isSuspiciouslyFast(languageId),
						languageId: signal.languageId,
						likelyOwnCode: signal.likelyOwnCode,
					});
				});
		} else if (linesAdded > 0) {
			// Human-paced typing: feed the "own code" cache and track total lines.
			deps.paste.noteLocalEdit(text);
			deps.stats.recordTyping(linesAdded);
			// Still let the nudge engine consider fast-typing alerts.
			deps.nudges.evaluate({
				linesAdded,
				isFastTyping: deps.cadence.isSuspiciouslyFast(languageId),
				languageId,
				likelyOwnCode: true,
			});
		} else {
			deps.paste.noteLocalEdit(text);
		}
	}
}

function updateStatusBar(item: vscode.StatusBarItem, stats: StatsService, show: boolean): void {
	if (!show) {
		item.hide();
		return;
	}
	const today = stats.snapshot().today;
	const icon = today.score >= 80 ? '$(eye)' : today.score >= 50 ? '$(warning)' : '$(error)';
	item.text = `${icon} AI Footprint: ${today.score}`;
	item.show();
}

function registerCommands(
	context: vscode.ExtensionContext,
	stats: StatsService,
	nudges: NudgeEngine,
): vscode.Disposable {
	const subs = vscode.Disposable.from(
		vscode.commands.registerCommand('ai-footprint.showDashboard', () => {
			DashboardPanel.show(context, stats);
		}),
		vscode.commands.registerCommand('ai-footprint.snooze30', () => nudges.snooze(30)),
		vscode.commands.registerCommand('ai-footprint.exportData', async () => {
			const data = {
				exportedAt: new Date().toISOString(),
				last7Days: stats.lastNDays(7),
				last30Days: stats.lastNDays(30),
				snapshot: stats.snapshot(),
			};
			const target = await vscode.window.showSaveDialog({
				filters: { JSON: ['json'] },
				defaultUri: vscode.Uri.file('ai-footprint-export.json'),
			});
			if (!target) {return;}
			await vscode.workspace.fs.writeFile(
				target,
				Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
			);
			void vscode.window.showInformationMessage(`AI Footprint: exported to ${target.fsPath}`);
		}),
		vscode.commands.registerCommand('ai-footprint.clearData', async () => {
			const choice = await vscode.window.showWarningMessage(
				'Clear all AI Footprint data? This is irreversible.',
				{ modal: true },
				'Clear',
			);
			if (choice !== 'Clear') {return;}
			await stats.clear();
			await context.globalState.update(STORAGE_KEYS.cadenceBaselines, undefined);
			await context.globalState.update(STORAGE_KEYS.nudgeHistory, undefined);
			await context.globalState.update(STORAGE_KEYS.snoozeUntil, undefined);
			void vscode.window.showInformationMessage('AI Footprint: data cleared.');
		}),
	);
	return subs;
}

function maybeShowOnboarding(context: vscode.ExtensionContext): void {
	if (context.globalState.get<boolean>(STORAGE_KEYS.onboarded)) {return;}
	void vscode.window
		.showInformationMessage(
			"AI Footprint is now watching how your code arrives, not what it says. Everything stays on this machine. You can disable it anytime in Settings.",
			"Got it",
			"Open Settings",
		)
		.then(choice => {
			if (choice === 'Open Settings') {
				void vscode.commands.executeCommand('workbench.action.openSettings', 'aiFootprint');
			}
			void context.globalState.update(STORAGE_KEYS.onboarded, true);
		});
}
