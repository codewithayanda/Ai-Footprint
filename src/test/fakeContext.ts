import type * as vscode from 'vscode';

export function fakeContext(initial: Record<string, unknown> = {}): {
	context: vscode.ExtensionContext;
	writes: string[];
	store: Map<string, unknown>;
} {
	const store = new Map<string, unknown>(Object.entries(initial));
	const writes: string[] = [];
	const context = {
		globalState: {
			get: (key: string) => store.get(key),
			update: async (key: string, value: unknown) => { writes.push(key); store.set(key, value); },
		},
	} as unknown as vscode.ExtensionContext;
	return { context, writes, store };
}
