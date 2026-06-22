import * as vscode from 'vscode';
import { CadenceTracker } from './detectors/cadenceTracker';
import { NudgeEngine } from './nudge/nudgeEngine';

export function activate(context: vscode.ExtensionContext) {
	console.log('AI Footprint is now active!');

	const cadenceTracker = new CadenceTracker(context);
	const nudgeEngine = new NudgeEngine(context);

	// Load saved nudge history on startup
	nudgeEngine.loadHistory();

	const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		for (const change of event.contentChanges) {
			const textAdded = change.text;
			const linesAdded = textAdded.split('\n').length - 1;
			const charsAdded = textAdded.length;

			// Track cadence
			cadenceTracker.track(linesAdded, charsAdded);

			// Let the nudge engine decide what to do
			nudgeEngine.evaluate(linesAdded, cadenceTracker.isSuspiciouslyFast());
		}
	});

	context.subscriptions.push(textChangeListener);
}

export function deactivate() {}