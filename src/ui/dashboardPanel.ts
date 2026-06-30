import * as vscode from 'vscode';
import type { StatsService, SnapshotEvent } from '../services/statsService';

export class DashboardPanel implements vscode.Disposable {
	static current?: DashboardPanel;

	private readonly disposables: vscode.Disposable[] = [];

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly stats: StatsService,
	) {
		this.panel.webview.html = this.shellHtml(panel.webview.cspSource);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		// Push initial snapshot + subscribe to future changes.
		this.push(this.stats.snapshot());
		this.disposables.push(this.stats.onChanged(s => this.push(s)));
	}

	static show(context: vscode.ExtensionContext, stats: StatsService): DashboardPanel {
		const column = vscode.window.activeTextEditor ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;
		if (DashboardPanel.current) {
			DashboardPanel.current.panel.reveal(column);
			return DashboardPanel.current;
		}
		const panel = vscode.window.createWebviewPanel(
			'aiFootprintDashboard',
			'AI Footprint',
			column,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		DashboardPanel.current = new DashboardPanel(panel, stats);
		context.subscriptions.push(DashboardPanel.current);
		return DashboardPanel.current;
	}

	dispose(): void {
		DashboardPanel.current = undefined;
		this.panel.dispose();
		while (this.disposables.length) {this.disposables.pop()?.dispose();}
	}

	private push(snapshot: SnapshotEvent): void {
		// Panel is a dumb view. All derived numbers (reliance, deltas, averages)
		// come from StatsService so a future status-bar or hover view reuses the same math.
		// We send the full last-14-day records (not a stripped projection) because the
		// detail panel needs hourlyPastes and biggestPasteLines per day.
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

	private shellHtml(cspSource: string): string {
		const csp = [
			"default-src 'none'",
			`style-src ${cspSource} 'unsafe-inline'`,
			`script-src ${cspSource} 'unsafe-inline'`,
		].join('; ');

		// NOTE: as soon as this file passes ~300 lines, extract the HTML/CSS/JS into
		// separate files under media/ and load them via webview.asWebviewUri. For now
		// keeping inline so the diff is reviewable and there's no extra packaging step.
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>AI Footprint</title>
<style>
	:root {
		--bg: var(--vscode-editor-background, #1e1e1e);
		--fg: var(--vscode-editor-foreground, #d4d4d4);
		--panel: var(--vscode-editorWidget-background, #252526);
		--border: var(--vscode-editorWidget-border, #3c3c3c);
		--muted: rgba(255,255,255,0.55);
		--good: var(--vscode-testing-iconPassed, #4ec9b0);
		--warn: var(--vscode-charts-yellow, #dcdcaa);
		--bad: var(--vscode-errorForeground, #f44747);
		--focus: var(--vscode-focusBorder, #4ec9b0);
		--r: 12px;
	}
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		background: var(--bg); color: var(--fg);
		padding: 24px; line-height: 1.5;
	}
	header { margin-bottom: 20px; }
	h1 { font-size: 18px; font-weight: 600; }
	.subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }

	.top-row {
		display: grid;
		grid-template-columns: minmax(160px, 1fr) 2fr;
		gap: 12px;
		margin-bottom: 16px;
	}
	.score-card {
		background: var(--panel); border: 1px solid var(--border);
		border-radius: var(--r); padding: 20px; text-align: center;
		position: relative; overflow: hidden;
	}
	.score-card::after {
		content: ''; position: absolute; inset: 0;
		background: radial-gradient(circle at 50% 0%, var(--score-tint, transparent) 0%, transparent 65%);
		opacity: 0.5; pointer-events: none;
		transition: background 600ms ease;
	}
	.score-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
	.score-value { font-size: 48px; font-weight: 700; line-height: 1; margin-top: 8px; transition: color 400ms ease; position: relative; z-index: 1; }

	.message-card {
		background: var(--panel); border: 1px solid var(--border);
		border-radius: var(--r); padding: 16px 18px;
		display: flex; flex-direction: column; justify-content: center; gap: 8px;
	}
	.message-headline { font-size: 14px; font-weight: 600; }
	.delta-row { display: flex; gap: 14px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
	.delta { display: inline-flex; align-items: center; gap: 4px; }
	.delta.up { color: var(--good); }
	.delta.down { color: var(--bad); }
	.delta.neutral { color: var(--muted); }

	.chart-card {
		background: var(--panel); border: 1px solid var(--border);
		border-radius: var(--r); padding: 16px; margin-bottom: 16px;
	}
	.chart-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
	.chart-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
	.chart-hint { font-size: 11px; color: var(--muted); font-style: italic; }

	.chart {
		display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px;
		align-items: end; height: 80px; margin-bottom: 6px;
	}
	.bar {
		background: var(--good); border-radius: 3px 3px 0 0; cursor: pointer;
		transition: height 500ms cubic-bezier(.2,.8,.2,1), background 200ms ease, opacity 200ms ease;
		min-height: 3px; opacity: 0.55;
	}
	.bar:hover { opacity: 0.85; }
	.bar.selected { opacity: 1; outline: 2px solid var(--focus); outline-offset: 1px; }
	.bar.warn { background: var(--warn); }
	.bar.bad  { background: var(--bad); }
	.bar.empty { background: var(--border); opacity: 0.3; cursor: default; }

	.chart-labels {
		display: grid; grid-template-columns: repeat(14, 1fr); gap: 4px;
		font-size: 10px; color: var(--muted); text-align: center; margin-top: 4px;
	}
	.chart-labels span.selected { color: var(--fg); font-weight: 600; }

	.detail-card {
		background: var(--panel); border: 1px solid var(--border);
		border-radius: var(--r); padding: 18px; margin-bottom: 16px;
	}
	.detail-header {
		display: flex; justify-content: space-between; align-items: baseline;
		margin-bottom: 14px;
	}
	.detail-date { font-size: 14px; font-weight: 600; }
	.detail-score { font-size: 12px; color: var(--muted); }
	.detail-stats {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
		margin-bottom: 18px;
	}
	.stat .v { font-size: 22px; font-weight: 700; }
	.stat .l { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

	.hourly-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
	.hourly {
		display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px;
		align-items: end; height: 40px;
	}
	.hourly div {
		background: var(--good); border-radius: 2px 2px 0 0;
		opacity: 0.85; transition: height 500ms cubic-bezier(.2,.8,.2,1);
		min-height: 2px;
	}
	.hourly div.zero { background: var(--border); opacity: 0.25; }
	.hourly-axis {
		display: flex; justify-content: space-between;
		font-size: 10px; color: var(--muted); margin-top: 4px; padding: 0 2px;
	}
	.hourly-empty { font-size: 12px; color: var(--muted); font-style: italic; padding: 8px 0; text-align: center; }

	.streak-row { display: flex; gap: 12px; margin-bottom: 12px; }
	.streak-card {
		flex: 1; background: var(--panel); border: 1px solid var(--border);
		border-radius: var(--r); padding: 14px 16px;
		display: flex; align-items: center; justify-content: space-between;
	}
	.streak-card .l { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
	.streak-card .v { font-size: 20px; font-weight: 700; }

	.footer { font-size: 11px; color: var(--muted); text-align: center; opacity: 0.6; margin-top: 8px; }
</style>
</head>
<body>
<header>
	<h1>AI Footprint</h1>
	<p class="subtitle">Helping you stay in control of your code</p>
</header>

<section class="top-row">
	<div class="score-card" id="scoreCard">
		<div class="score-label">Today's Score</div>
		<div class="score-value" id="score" data-value="0">…</div>
	</div>
	<div class="message-card">
		<div class="message-headline" id="message">Loading…</div>
		<div class="delta-row" id="deltaRow"></div>
	</div>
</section>

<section class="chart-card">
	<div class="chart-header">
		<span class="chart-title">Last 14 days</span>
		<span class="chart-hint">Click any day for detail</span>
	</div>
	<div class="chart" id="chart"></div>
	<div class="chart-labels" id="chartLabels"></div>
</section>

<section class="detail-card">
	<div class="detail-header">
		<span class="detail-date" id="detailDate">…</span>
		<span class="detail-score" id="detailScore"></span>
	</div>
	<div class="detail-stats" id="detailStats"></div>
	<div class="hourly-title">When pastes happened</div>
	<div id="hourlyWrap">
		<div class="hourly" id="hourly"></div>
		<div class="hourly-axis"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:59</span></div>
	</div>
</section>

<section class="streak-row">
	<div class="streak-card"><span class="l">Current streak</span><span class="v" id="streakCurrent" data-value="0">0</span></div>
	<div class="streak-card"><span class="l">Best streak</span><span class="v" id="streakBest" data-value="0">0</span></div>
</section>

<p class="footer">AI Footprint · all data stays on this machine</p>

<script>
	const state = {
		last14: [], today: null, streak: { current: 0, best: 0 },
		reliance: 0, avg7: null, deltas: {}, selected: 13,
	};
	const $ = id => document.getElementById(id);

	function colorClass(score) {
		if (score >= 80) return 'good';
		if (score >= 50) return 'warn';
		return 'bad';
	}
	function colorVar(score) {
		if (score >= 80) return 'var(--good)';
		if (score >= 50) return 'var(--warn)';
		return 'var(--bad)';
	}
	function headlineFor(score) {
		if (score >= 80) return '🟢 Solid day. Most of this is your code.';
		if (score >= 50) return '🟡 Mixed day. Worth a review pass.';
		return '🔴 Heavy AI day. Read what you added.';
	}

	// Ease-out cubic count-up; reads previous shown value from data-value to feel continuous.
	function tween(el, target, ms) {
		const start = parseInt(el.dataset.value || '0', 10);
		if (start === target) { el.textContent = String(target); el.dataset.value = String(target); return; }
		const t0 = performance.now();
		function step(now) {
			const k = Math.min(1, (now - t0) / ms);
			const eased = 1 - Math.pow(1 - k, 3);
			const v = Math.round(start + (target - start) * eased);
			el.textContent = String(v);
			if (k < 1) requestAnimationFrame(step);
			else el.dataset.value = String(target);
		}
		requestAnimationFrame(step);
	}

	// For score-type deltas: positive = good (green), negative = bad (red).
	function deltaPill(label, value) {
		if (value === null || value === undefined) return '';
		const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
		const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
		const sign = value > 0 ? '+' : '';
		return '<span class="delta ' + cls + '">' + arrow + ' ' + sign + value + ' ' + label + '</span>';
	}
	// For pastes-type deltas: positive = MORE pastes = bad (red), flip colors.
	function deltaPillInverted(label, value) {
		if (value === null || value === undefined) return '';
		const cls = value > 0 ? 'down' : value < 0 ? 'up' : 'neutral';
		const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
		const sign = value > 0 ? '+' : '';
		return '<span class="delta ' + cls + '">' + arrow + ' ' + sign + value + ' ' + label + '</span>';
	}

	function fmtDate(iso) {
		const [y,m,d] = iso.split('-').map(Number);
		return new Date(y, m-1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
	function weekdayNarrow(iso) {
		const [y,m,d] = iso.split('-').map(Number);
		return new Date(y, m-1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
	}
	function todayIso() {
		const d = new Date();
		return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
	}

	function renderTop() {
		const t = state.today;
		tween($('score'), t.score, 600);
		$('score').style.color = colorVar(t.score);
		$('scoreCard').style.setProperty('--score-tint', colorVar(t.score));
		$('message').textContent = headlineFor(t.score);
		const d = state.deltas || {};
		const pills = [
			deltaPill('vs yesterday', d.scoreVsYesterday),
			deltaPill('vs 7d avg', d.scoreVs7dAvg),
			deltaPillInverted('pastes vs yest.', d.pastesVsYesterday),
		].filter(Boolean);
		$('deltaRow').innerHTML = pills.length
			? pills.join('')
			: '<span class="delta neutral">Not enough history yet, keep coding</span>';
	}

	function renderChart() {
		// Scale bars against the max score in the window so even mostly-clean weeks have visible variation.
		const max = Math.max(1, ...state.last14.map(d => d.score));
		$('chart').innerHTML = state.last14.map((d, i) => {
			const active = d.totalLinesAdded > 0;
			const cls = active ? colorClass(d.score) : 'empty';
			const sel = i === state.selected ? ' selected' : '';
			const h = active ? (d.score / max) * 100 : 8;
			const tip = active
				? d.date + ': score ' + d.score + ', ' + d.pastes + ' paste(s)'
				: d.date + ': no activity';
			return '<div class="bar ' + cls + sel + '" data-i="' + i + '" title="' + tip + '" style="height:' + h + '%"></div>';
		}).join('');
		$('chartLabels').innerHTML = state.last14.map((d, i) =>
			'<span class="' + (i === state.selected ? 'selected' : '') + '">' + weekdayNarrow(d.date) + '</span>'
		).join('');
		document.querySelectorAll('#chart .bar').forEach(b => {
			b.addEventListener('click', () => {
				const i = parseInt(b.dataset.i, 10);
				if (state.last14[i] && state.last14[i].totalLinesAdded === 0) return; // ignore empty days
				state.selected = i;
				renderChart();
				renderDetail();
			});
		});
	}

	function renderDetail() {
		const d = state.last14[state.selected];
		if (!d) return;
		const reliance = d.totalLinesAdded > 0
			? Math.min(100, Math.round((d.pastedLines / d.totalLinesAdded) * 100))
			: 0;
		const isToday = d.date === todayIso();
		$('detailDate').textContent = (isToday ? 'Today · ' : '') + fmtDate(d.date);
		$('detailScore').textContent = d.totalLinesAdded > 0 ? 'Score ' + d.score : 'No activity';
		$('detailStats').innerHTML =
			'<div class="stat"><div class="v">' + d.pastes + '</div><div class="l">Pastes</div></div>' +
			'<div class="stat"><div class="v">' + (d.biggestPasteLines || 0) + '</div><div class="l">Biggest paste</div></div>' +
			'<div class="stat"><div class="v">' + reliance + '%</div><div class="l">AI Reliance</div></div>' +
			'<div class="stat"><div class="v">' + d.nudges + '</div><div class="l">Nudges</div></div>';

		const hp = Array.isArray(d.hourlyPastes) ? d.hourlyPastes : new Array(24).fill(0);
		const total = hp.reduce((s,x) => s + x, 0);
		if (total === 0) {
			$('hourly').innerHTML = '<div class="hourly-empty" style="grid-column:1/-1">No pastes recorded</div>';
		} else {
			const max = Math.max(1, ...hp);
			$('hourly').innerHTML = hp.map((v, h) =>
				'<div class="' + (v === 0 ? 'zero' : '') + '" style="height:' + (v / max * 100) + '%" title="' + String(h).padStart(2,'0') + ':00 · ' + v + ' paste(s)"></div>'
			).join('');
		}
	}

	function renderStreak() {
		tween($('streakCurrent'), state.streak.current || 0, 500);
		tween($('streakBest'), state.streak.best || 0, 500);
	}

	function render() {
		if (!state.today) return;
		renderTop();
		renderChart();
		renderDetail();
		renderStreak();
	}

	window.addEventListener('message', e => {
		const m = e.data;
		if (m.type !== 'update') return;
		state.today = m.today;
		state.streak = m.streak;
		state.last14 = m.last14;
		state.reliance = m.reliance;
		state.avg7 = m.avg7;
		state.deltas = m.deltas;
		// Default selection is today (last index). Re-clamp if window shrank.
		if (state.selected == null || state.selected >= state.last14.length) {
			state.selected = state.last14.length - 1;
		}
		render();
	});
</script>
</body>
</html>`;
	}
}
