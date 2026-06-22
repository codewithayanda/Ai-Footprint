import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Footprint is now active!');

	const cadenceTracker = new CadenceTracker(context);
	const PASTE_THRESHOLD = 5;

	const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		for (const change of event.contentChanges) {
			const textAdded = change.text;
			const linesAdded = textAdded.split('\n').length - 1;
			const charsAdded = textAdded.length;

			// Always track the change
			cadenceTracker.track(linesAdded, charsAdded);

			// PASTE DETECTION
			if (linesAdded >= PASTE_THRESHOLD) {
				console.log('🚨 PASTE DETECTED —', linesAdded, 'lines');
				vscode.window.showWarningMessage(
					`AI Footprint: Large paste detected (${linesAdded} lines). Make sure you understand this code!`
				);
			}

			// CADENCE DETECTION
			if (cadenceTracker.isSuspiciouslyFast()) {
				console.log('⚡ SUSPICIOUSLY FAST TYPING DETECTED');
				vscode.window.showWarningMessage(
					'AI Footprint: Your typing speed seems unusual. Are you reviewing what you\'re adding?'
				);
			}

			// Log current average for debugging
			console.log('Current avg interval:', cadenceTracker.getAverageInterval(), 'ms');
			console.log('Baseline:', cadenceTracker.getBaseline());
		}
	});

	context.subscriptions.push(textChangeListener);
}

export function deactivate() {}