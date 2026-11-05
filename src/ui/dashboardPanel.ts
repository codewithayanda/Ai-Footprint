import * as fs from 'fs';
import * as vscode from 'vscode';
import type { StatsService, SnapshotEvent } from '../services/statsService';
import { newNonce, renderDashboardHtml } from './dashboardHtml';

export class DashboardPanel implements vscode.Disposable {
	static current?: DashboardPanel;

	private readonly disposables: vscode.Disposable[] = [];

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly stats: StatsService,
		mediaRoot: vscode.Uri,
	) {
		const webview = panel.webview;
		const asset = (name: string): string => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, name)).toString();
		webview.html = renderDashboardHtml(
			fs.readFileSync(vscode.Uri.joinPath(mediaRoot, 'dashboard.html').fsPath, 'utf8'),
			{ cspSource: webview.cspSource, nonce: newNonce(), cssUri: asset('dashboard.css'), jsUri: asset('dashboard.js') },
		);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.push(this.stats.snapshot());
		this.disposables.push(this.stats.onChanged(s => this.push(s)));
	}

	static show(context: vscode.ExtensionContext, stats: StatsService): DashboardPanel {
		const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
		if (DashboardPanel.current) {
			DashboardPanel.current.panel.reveal(column);
			return DashboardPanel.current;
		}
		const mediaRoot = vscode.Uri.joinPath(context.extensionUri, 'media', 'dashboard');
		const panel = vscode.window.createWebviewPanel(
			'aiFootprintDashboard',
			'AI Footprint',
			column,
			{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [mediaRoot] },
		);
		DashboardPanel.current = new DashboardPanel(panel, stats, mediaRoot);
		context.subscriptions.push(DashboardPanel.current);
		return DashboardPanel.current;
	}

	dispose(): void {
		DashboardPanel.current = undefined;
		this.panel.dispose();
		while (this.disposables.length) {this.disposables.pop()?.dispose();}
	}

	// The panel is a dumb view: every derived number comes from StatsService.
	// Full 14-day records are sent because the detail view needs hourlyPastes and biggestPasteLines.
	private push(snapshot: SnapshotEvent): void {
		const { today, streak, reliance, avg7, deltas } = snapshot;

		void this.panel.webview.postMessage({
			type: 'update',
			today,
			streak,
			last14: this.stats.lastNDays(14),
			reliance,
			avg7,
			deltas,
		});
	}
}
