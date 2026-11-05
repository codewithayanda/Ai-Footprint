import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';
import { PasteDetector, countLines, countNewlines } from './detectors/pasteDetector';
import { isSyncedWithDisk } from './detectors/externalChange';
import { NudgeEngine } from './nudge/nudgeEngine';
import { StatsService, SnapshotEvent } from './services/statsService';
import { DashboardPanel } from './ui/dashboardPanel';
import { getSettings, onSettingsChanged } from './config/settings';
import { STORAGE_KEYS } from './constants';

let activeStats: StatsService | undefined;

/** Read-only window onto the stats, used by the end-to-end tests. */
export interface ExtensionApi {
	snapshot(): SnapshotEvent;
	clearStats(): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
	const stats = new StatsService(context);
	activeStats = stats;
	const cadence = new CadenceTracker(context);
	const nudges = new NudgeEngine(context, stats);
	const paste = new PasteDetector(() => getSettings().clipboardAware);

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = 'ai-footprint.showDashboard';
	statusBar.tooltip = 'AI Footprint · click to open dashboard';
	updateStatusBar(statusBar, stats, getSettings().showStatusBar);

	context.subscriptions.push(
		stats,
		nudges,
		statusBar,
		stats.onChanged(() => updateStatusBar(statusBar, stats, getSettings().showStatusBar)),
		registerCommands(context, stats, nudges, cadence),
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

	return { snapshot: () => stats.snapshot(), clearStats: () => stats.clear() };
}

export function deactivate(): Promise<void> | undefined {
	return activeStats?.flush();
}

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

	if (event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo) {return;}

	const hasPasteSizedChange = event.contentChanges.some(c => countLines(c.text) >= pasteThreshold);
	if (!hasPasteSizedChange) {
		processChanges(event, deps, pasteThreshold);
		return;
	}

	void isSyncedWithDisk(event.document).then(synced => {
		if (!synced) {processChanges(event, deps, pasteThreshold);}
	});
}

function processChanges(event: vscode.TextDocumentChangeEvent, deps: Deps, pasteThreshold: number): void {
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
					if (signal.clipboard === 'mismatch') {return;}
					deps.stats.recordPaste(signal.lines);
					deps.nudges.evaluate({
						linesAdded: signal.lines,
						isFastTyping: deps.cadence.isSuspiciouslyFast(languageId),
						languageId: signal.languageId,
						likelyOwnCode: signal.likelyOwnCode,
					});
				});
		} else {
			deps.paste.noteLocalEdit(text);

			if (charsAdded > 0) {
				const typedLines = countNewlines(text);
				if (typedLines > 0) {deps.stats.recordTyping(typedLines);}

				deps.nudges.evaluate({
					linesAdded: typedLines,
					isFastTyping: deps.cadence.isSuspiciouslyFast(languageId),
					languageId,
					likelyOwnCode: true,
				});
			}
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
	cadence: CadenceTracker,
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
			await Promise.all([stats.clear(), nudges.clear(), cadence.clear()]);
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
