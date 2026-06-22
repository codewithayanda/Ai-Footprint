import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';
import { NudgeEngine } from './nudge/nudgeEngine';
import { DashboardPanel } from './ui/dashboardPanel';
import { getSettings, onSettingsChanged } from './config/settings';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Footprint is now active!');

	const cadenceTracker = new CadenceTracker(context);
	const nudgeEngine = new NudgeEngine(context);
	nudgeEngine.loadHistory();

	let todayPastes = 0;
	let aiScore = 100;

	const dashboardCommand = vscode.commands.registerCommand(
		'ai-footprint.showDashboard',
		() => {
			const panel = DashboardPanel.show(context);
			panel.updateStats({
				todayPastes,
				nudgesReceived: nudgeEngine.getStats().total,
				aiScore,
				streak: 0
			});
		}
	);

	const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		// Respect the enabled setting
		const { enabled, pasteThreshold } = getSettings();
		if (!enabled) return;

		for (const change of event.contentChanges) {
			const textAdded = change.text;
			const linesAdded = textAdded.split('\n').length - 1;
			const charsAdded = textAdded.length;

			cadenceTracker.track(linesAdded, charsAdded);
			nudgeEngine.evaluate(linesAdded, cadenceTracker.isSuspiciouslyFast());

			// Use dynamic threshold from settings
			if (linesAdded >= pasteThreshold) {
				todayPastes++;
				aiScore = Math.max(0, aiScore - Math.floor(linesAdded / 5));

				if (DashboardPanel.currentPanel) {
					DashboardPanel.currentPanel.updateStats({
						todayPastes,
						nudgesReceived: nudgeEngine.getStats().total,
						aiScore,
						streak: 0
					});
				}
			}
		}
	});

	// React to settings changes live
	const settingsListener = onSettingsChanged(() => {
		const { enabled } = getSettings();
		vscode.window.setStatusBarMessage(
			enabled
				? '$(eye) AI Footprint: Monitoring enabled'
				: '$(eye-closed) AI Footprint: Monitoring disabled',
			4000
		);
	});

	context.subscriptions.push(
		dashboardCommand,
		textChangeListener,
		settingsListener
	);
}

export function deactivate() {}