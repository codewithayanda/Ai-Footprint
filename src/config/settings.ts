import * as vscode from 'vscode';

export function getSettings() {
	const config = vscode.workspace.getConfiguration('aiFootprint');

	return {
		pasteThreshold: config.get<number>('pasteThreshold') ?? 5,
		cooldownMinutes: config.get<number>('cooldownMinutes') ?? 5,
		enabled: config.get<boolean>('enabled') ?? true,
	};
}

// Watch for settings changes in real time
export function onSettingsChanged(callback: () => void): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('aiFootprint')) {
			console.log('AI Footprint settings changed — reloading');
			callback();
		}
	});
}