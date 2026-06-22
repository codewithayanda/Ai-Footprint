import * as vscode from 'vscode';

export class DashboardPanel {
	public static currentPanel: DashboardPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

	// Stats we'll display
	private stats = {
		todayPastes: 0,
		nudgesReceived: 0,
		aiScore: 100, // starts at 100, goes down with pastes
		streak: 0,    // days of clean coding
	};

	private constructor(panel: vscode.WebviewPanel) {
		this.panel = panel;

		// Render initial content
		this.update();

		// Cleanup when panel is closed
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	// Open or reveal the dashboard
	public static show(context: vscode.ExtensionContext): DashboardPanel {
		const column = vscode.window.activeTextEditor
			? vscode.ViewColumn.Beside
			: vscode.ViewColumn.One;

		// If panel already exists, just show it
		if (DashboardPanel.currentPanel) {
			DashboardPanel.currentPanel.panel.reveal(column);
			return DashboardPanel.currentPanel;
		}

		// Otherwise create a new one
		const panel = vscode.window.createWebviewPanel(
			'aiFootprintDashboard',
			'AI Footprint',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		DashboardPanel.currentPanel = new DashboardPanel(panel);
		return DashboardPanel.currentPanel;
	}

	// Update stats and re-render
	public updateStats(stats: {
		todayPastes: number;
		nudgesReceived: number;
		aiScore: number;
		streak: number;
	}): void {
		this.stats = stats;
		this.update();
	}

	// Re-render the webview content
	private update(): void {
		this.panel.webview.html = this.getHtml();
	}

	// The actual HTML dashboard
	private getHtml(): string {
		const { todayPastes, nudgesReceived, aiScore, streak } = this.stats;

		// Score color — green if good, yellow if ok, red if bad
		const scoreColor =
			aiScore >= 80 ? '#4ec9b0' :
			aiScore >= 50 ? '#dcdcaa' :
			'#f44747';

		const scoreEmoji =
			aiScore >= 80 ? '🟢' :
			aiScore >= 50 ? '🟡' :
			'🔴';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>AI Footprint</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			background: #1e1e1e;
			color: #d4d4d4;
			padding: 24px;
		}

		h1 {
			font-size: 18px;
			font-weight: 600;
			color: #ffffff;
			margin-bottom: 4px;
		}

		.subtitle {
			font-size: 12px;
			color: #858585;
			margin-bottom: 24px;
		}

		.score-card {
			background: #252526;
			border-radius: 12px;
			padding: 24px;
			text-align: center;
			margin-bottom: 20px;
			border: 1px solid #3c3c3c;
		}

		.score-label {
			font-size: 12px;
			color: #858585;
			text-transform: uppercase;
			letter-spacing: 1px;
			margin-bottom: 8px;
		}

		.score-value {
			font-size: 64px;
			font-weight: 700;
			color: ${scoreColor};
			line-height: 1;
			margin-bottom: 8px;
		}

		.score-emoji {
			font-size: 20px;
		}

		.grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 12px;
			margin-bottom: 20px;
		}

		.stat-card {
			background: #252526;
			border-radius: 10px;
			padding: 16px;
			border: 1px solid #3c3c3c;
		}

		.stat-icon {
			font-size: 20px;
			margin-bottom: 8px;
		}

		.stat-value {
			font-size: 28px;
			font-weight: 700;
			color: #ffffff;
			margin-bottom: 4px;
		}

		.stat-label {
			font-size: 11px;
			color: #858585;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.message {
			background: #252526;
			border-radius: 10px;
			padding: 16px;
			border: 1px solid #3c3c3c;
			font-size: 13px;
			color: #858585;
			line-height: 1.6;
			margin-bottom: 20px;
		}

		.message span {
			color: #d4d4d4;
			font-weight: 500;
		}

		.footer {
			font-size: 11px;
			color: #555;
			text-align: center;
		}
	</style>
</head>
<body>
	<h1>🤖 AI Footprint</h1>
	<p class="subtitle">Helping you stay in control of your code</p>

	<!-- AI Score -->
	<div class="score-card">
		<div class="score-label">Today's AI Score</div>
		<div class="score-value">${aiScore}</div>
		<div class="score-emoji">${scoreEmoji}</div>
	</div>

	<!-- Stats Grid -->
	<div class="grid">
		<div class="stat-card">
			<div class="stat-icon">📋</div>
			<div class="stat-value">${todayPastes}</div>
			<div class="stat-label">Pastes Today</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon">💡</div>
			<div class="stat-value">${nudgesReceived}</div>
			<div class="stat-label">Nudges Received</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon">🔥</div>
			<div class="stat-value">${streak}</div>
			<div class="stat-label">Day Streak</div>
		</div>
		<div class="stat-card">
			<div class="stat-icon">⌨️</div>
			<div class="stat-value">${100 - aiScore}%</div>
			<div class="stat-label">AI Reliance</div>
		</div>
	</div>

	<!-- Motivational Message -->
	<div class="message">
		${this.getMessage(aiScore, streak)}
	</div>

	<div class="footer">AI Footprint • Refreshes automatically</div>
</body>
</html>`;
	}

	// Dynamic message based on score
	private getMessage(score: number, streak: number): string {
		if (score >= 80) {
			return `<span>You're doing great!</span> You're writing most of your code manually today. Keep it up — this is how real understanding is built.`;
		}
		if (score >= 50) {
			return `<span>Not bad, but watch yourself.</span> You've been leaning on AI a bit today. Make sure you understand everything you've added before moving on.`;
		}
		return `<span>Heavy AI usage detected today.</span> That's okay — but take some time to go back and review what's been added. Understanding your own codebase is non-negotiable.`;
	}

	public dispose(): void {
		DashboardPanel.currentPanel = undefined;
		this.panel.dispose();
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}