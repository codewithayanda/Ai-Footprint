import * as vscode from 'vscode';

export interface AiFootprintSettings {
	enabled: boolean;
	pasteThreshold: number;
	cooldownMinutes: number;
	clipboardAware: boolean;
	showStatusBar: boolean;
	quietWhileDebugging: boolean;
	excludeLanguages: string[];
	excludeGlobs: string[];
}

export function getSettings(): AiFootprintSettings {
	const config = vscode.workspace.getConfiguration('aiFootprint');
	return {
		enabled: config.get<boolean>('enabled') ?? true,
		pasteThreshold: clamp(config.get<number>('pasteThreshold') ?? 5, 3, 200),
		cooldownMinutes: clamp(config.get<number>('cooldownMinutes') ?? 5, 1, 240),
		clipboardAware: config.get<boolean>('clipboardAware') ?? true,
		showStatusBar: config.get<boolean>('showStatusBar') ?? true,
		quietWhileDebugging: config.get<boolean>('quietWhileDebugging') ?? true,
		excludeLanguages: stringList(config.get('excludeLanguages')),
		excludeGlobs: stringList(config.get('excludeGlobs')),
	};
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
		: [];
}

export function onSettingsChanged(callback: (s: AiFootprintSettings) => void): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration('aiFootprint')) {
			callback(getSettings());
		}
	});
}

function clamp(n: number, min: number, max: number): number {
	if (!Number.isFinite(n)) {return min;}
	return Math.min(max, Math.max(min, n));
}
