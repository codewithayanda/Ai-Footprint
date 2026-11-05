'use strict';

const state = {
	last14: [], today: null, streak: { current: 0, best: 0 },
	reliance: 0, avg7: null, deltas: {}, selected: 13,
};
const $ = id => document.getElementById(id);

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) { node.className = className; }
	if (text !== undefined) { node.textContent = text; }
	return node;
}

function colorClass(score) {
	if (score >= 80) { return 'good'; }
	if (score >= 50) { return 'warn'; }
	return 'bad';
}
function colorVar(score) {
	if (score >= 80) { return 'var(--good)'; }
	if (score >= 50) { return 'var(--warn)'; }
	return 'var(--bad)';
}
function headlineFor(score) {
	if (score >= 80) { return '🟢 Solid day. Most of this is your code.'; }
	if (score >= 50) { return '🟡 Mixed day. Worth a review pass.'; }
	return '🔴 Heavy AI day. Read what you added.';
}

// Ease-out cubic count-up; reads previous shown value from data-value to feel continuous.
function tween(node, target, ms) {
	const start = parseInt(node.dataset.value || '0', 10);
	if (start === target) { node.textContent = String(target); node.dataset.value = String(target); return; }
	const t0 = performance.now();
	function step(now) {
		const k = Math.min(1, (now - t0) / ms);
		const eased = 1 - Math.pow(1 - k, 3);
		node.textContent = String(Math.round(start + (target - start) * eased));
		if (k < 1) { requestAnimationFrame(step); }
		else { node.dataset.value = String(target); }
	}
	requestAnimationFrame(step);
}

// Score deltas: positive is good. Paste deltas are inverted: more pastes is bad.
function deltaPill(label, value, inverted) {
	if (value === null || value === undefined) { return null; }
	const cls = value === 0 ? 'neutral' : ((value > 0) !== inverted ? 'up' : 'down');
	const arrow = value > 0 ? '▲' : value < 0 ? '▼' : '·';
	const sign = value > 0 ? '+' : '';
	return el('span', 'delta ' + cls, arrow + ' ' + sign + value + ' ' + label);
}

function parseIso(iso) {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}
function fmtDate(iso) {
	return parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function weekdayNarrow(iso) {
	return parseIso(iso).toLocaleDateString(undefined, { weekday: 'narrow' });
}
function todayIso() {
	const d = new Date();
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function renderTop() {
	const t = state.today;
	tween($('score'), t.score, 600);
	$('score').style.color = colorVar(t.score);
	$('scoreCard').style.setProperty('--score-tint', colorVar(t.score));
	$('message').textContent = headlineFor(t.score);
	const d = state.deltas || {};
	const pills = [
		deltaPill('vs yesterday', d.scoreVsYesterday, false),
		deltaPill('vs 7d avg', d.scoreVs7dAvg, false),
		deltaPill('pastes vs yest.', d.pastesVsYesterday, true),
	].filter(Boolean);
	$('deltaRow').replaceChildren(...(pills.length
		? pills
		: [el('span', 'delta neutral', 'Not enough history yet, keep coding')]));
}

function renderChart() {
	// Scale bars against the max score in the window so even mostly-clean weeks have visible variation.
	const max = Math.max(1, ...state.last14.map(d => d.score));
	const bars = state.last14.map((d, i) => {
		const active = d.totalLinesAdded > 0;
		const bar = el('div', 'bar ' + (active ? colorClass(d.score) : 'empty') + (i === state.selected ? ' selected' : ''));
		bar.dataset.i = String(i);
		bar.title = active
			? d.date + ': score ' + d.score + ', ' + d.pastes + ' paste(s)'
			: d.date + ': no activity';
		bar.style.height = (active ? (d.score / max) * 100 : 8) + '%';
		bar.addEventListener('click', () => {
			if (!active) { return; } // ignore empty days
			state.selected = i;
			renderChart();
			renderDetail();
		});
		return bar;
	});
	$('chart').replaceChildren(...bars);
	$('chartLabels').replaceChildren(...state.last14.map((d, i) =>
		el('span', i === state.selected ? 'selected' : '', weekdayNarrow(d.date))));
}

function statBlock(value, label) {
	const block = el('div', 'stat');
	block.append(el('div', 'v', String(value)), el('div', 'l', label));
	return block;
}

function renderDetail() {
	const d = state.last14[state.selected];
	if (!d) { return; }
	const reliance = d.totalLinesAdded > 0
		? Math.min(100, Math.round((d.pastedLines / d.totalLinesAdded) * 100))
		: 0;
	const isToday = d.date === todayIso();
	$('detailDate').textContent = (isToday ? 'Today · ' : '') + fmtDate(d.date);
	$('detailScore').textContent = d.totalLinesAdded > 0 ? 'Score ' + d.score : 'No activity';
	$('detailStats').replaceChildren(
		statBlock(d.pastes, 'Pastes'),
		statBlock(d.biggestPasteLines || 0, 'Biggest paste'),
		statBlock(reliance + '%', 'AI Reliance'),
		statBlock(d.nudges, 'Nudges'),
	);

	const hp = Array.isArray(d.hourlyPastes) ? d.hourlyPastes : new Array(24).fill(0);
	const total = hp.reduce((s, x) => s + x, 0);
	if (total === 0) {
		$('hourly').replaceChildren(el('div', 'hourly-empty', 'No pastes recorded'));
		return;
	}
	const max = Math.max(1, ...hp);
	$('hourly').replaceChildren(...hp.map((v, h) => {
		const tick = el('div', v === 0 ? 'zero' : '');
		tick.style.height = (v / max * 100) + '%';
		tick.title = String(h).padStart(2, '0') + ':00 · ' + v + ' paste(s)';
		return tick;
	}));
}

function renderStreak() {
	tween($('streakCurrent'), state.streak.current || 0, 500);
	tween($('streakBest'), state.streak.best || 0, 500);
}

function render() {
	if (!state.today) { return; }
	renderTop();
	renderChart();
	renderDetail();
	renderStreak();
}

window.addEventListener('message', e => {
	const m = e.data;
	if (!m || m.type !== 'update') { return; }
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
