import * as assert from 'assert';
import * as vscode from 'vscode';

const dashboardTabs = (): vscode.Tab[] =>
	vscode.window.tabGroups.all
		.flatMap(group => group.tabs)
		.filter(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('aiFootprintDashboard'));

// VS Code updates its tab list a moment after a panel opens or closes.
async function waitForTabs(count: number, timeoutMs = 5_000): Promise<vscode.Tab[]> {
	const end = Date.now() + timeoutMs;
	while (dashboardTabs().length !== count && Date.now() < end) {
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	return dashboardTabs();
}

suite('dashboard panel (real VS Code webview)', function () {
	this.timeout(30_000);

	suiteSetup(async () => {
		await vscode.extensions.getExtension('codewithayanda.ai-footprint')!.activate();
	});

	teardown(async () => {
		await vscode.window.tabGroups.close(dashboardTabs());
		await waitForTabs(0);
	});

	test('the command opens the dashboard as a webview tab', async () => {
		await vscode.commands.executeCommand('ai-footprint.showDashboard');
		const tabs = await waitForTabs(1);
		assert.strictEqual(tabs.length, 1);
		assert.strictEqual(tabs[0].label, 'AI Footprint');
	});

	test('running the command again reuses the open tab', async () => {
		await vscode.commands.executeCommand('ai-footprint.showDashboard');
		await waitForTabs(1);
		await vscode.commands.executeCommand('ai-footprint.showDashboard');
		await new Promise(resolve => setTimeout(resolve, 500));
		assert.strictEqual(dashboardTabs().length, 1);
	});

	test('the dashboard can be closed and opened again', async () => {
		await vscode.commands.executeCommand('ai-footprint.showDashboard');
		await waitForTabs(1);
		await vscode.window.tabGroups.close(dashboardTabs());
		await waitForTabs(0);
		await vscode.commands.executeCommand('ai-footprint.showDashboard');
		assert.strictEqual((await waitForTabs(1)).length, 1);
	});
});
