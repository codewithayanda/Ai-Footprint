import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';
import { NudgeEngine } from './nudge/nudgeEngine';
import { DashboardPanel } from './ui/dashboardPanel';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Footprint is now active!');

	const cadenceTracker = new CadenceTracker(context);
	const nudgeEngine = new NudgeEngine(context);
	nudgeEngine.loadHistory();

	// Track today's stats
	let todayPastes = 0;
	let aiScore = 100;

	// Register command to open dashboard
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
		for (const change of event.contentChanges) {
			const textAdded = change.text;
			const linesAdded = textAdded.split('\n').length - 1;
			const charsAdded = textAdded.length;

			cadenceTracker.track(linesAdded, charsAdded);
			nudgeEngine.evaluate(linesAdded, cadenceTracker.isSuspiciouslyFast());

			// Update stats when paste detected
			if (linesAdded >= 5) {
				todayPastes++;
				aiScore = Math.max(0, aiScore - Math.floor(linesAdded / 5));

				// Auto refresh dashboard if it's open
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

	context.subscriptions.push(dashboardCommand, textChangeListener);
}

export function deactivate() {}