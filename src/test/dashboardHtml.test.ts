import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildCsp, newNonce, renderDashboardHtml } from '../ui/dashboardHtml';

const dir = path.join(__dirname, '..', '..', 'media', 'dashboard');
const read = (file: string): string => fs.readFileSync(path.join(dir, file), 'utf8');
const values = { cspSource: 'https://webview.test', nonce: 'abc123+/==', cssUri: 'https://webview.test/a.css', jsUri: 'https://webview.test/a.js' };

suite('dashboard CSP and HTML', () => {
	test('the policy allows no inline code and no eval', () => {
		const csp = buildCsp(values.cspSource, values.nonce);
		assert.ok(!csp.includes('unsafe-inline'));
		assert.ok(!csp.includes('unsafe-eval'));
		assert.ok(csp.includes("default-src 'none'"));
	});

	test('scripts are limited to the nonce, styles to the webview origin', () => {
		const csp = buildCsp(values.cspSource, values.nonce);
		assert.ok(csp.includes(`script-src 'nonce-${values.nonce}'`));
		assert.ok(csp.includes(`style-src ${values.cspSource}`));
		assert.ok(!/script-src[^;]*https:/.test(csp), 'no origin may run scripts');
	});

	test('every nonce is fresh and long enough', () => {
		const nonces = new Set(Array.from({ length: 50 }, newNonce));
		assert.strictEqual(nonces.size, 50);
		assert.ok([...nonces].every(n => n.length >= 22 && /^[A-Za-z0-9+/=]+$/.test(n)));
	});

	test('the real template renders with every placeholder filled', () => {
		const html = renderDashboardHtml(read('dashboard.html'), values);
		assert.ok(!html.includes('{{'));
		assert.ok(html.includes(`<script nonce="${values.nonce}" src="${values.jsUri}"></script>`));
		assert.ok(html.includes(`<link rel="stylesheet" href="${values.cssUri}">`));
		assert.ok(html.includes(buildCsp(values.cspSource, values.nonce)));
	});

	test('an unknown placeholder is an error, not a silent blank', () => {
		assert.throws(() => renderDashboardHtml('<p>{{nonse}}</p>', values), /Unknown placeholder/);
	});

	test('values cannot break out of their attribute', () => {
		const html = renderDashboardHtml('<a href="{{jsUri}}">', { ...values, jsUri: '"><script>alert(1)</script>' });
		assert.ok(!html.includes('<script>alert'));
		assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
	});
});

suite('dashboard files stay compatible with the strict policy', () => {
	const html = read('dashboard.html');
	const js = read('dashboard.js');
	const css = read('dashboard.css');

	test('the template has exactly one script, carrying the nonce, and no inline style', () => {
		assert.strictEqual((html.match(/<script/g) ?? []).length, 1);
		assert.ok(/<script nonce="\{\{nonce\}\}" src="\{\{jsUri\}\}"><\/script>/.test(html));
		assert.ok(!/<style/i.test(html));
		assert.ok(!/\sstyle\s*=/i.test(html));
		assert.ok(!/\son[a-z]+\s*=/i.test(html), 'no inline event handlers');
	});

	test('the script never builds markup from strings or evaluates code', () => {
		for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'eval(', 'new Function', 'document.write', "setAttribute('style'", 'style="']) {
			assert.ok(!js.includes(banned), `dashboard.js must not use ${banned}`);
		}
	});

	test('the stylesheet pulls nothing from the network', () => {
		assert.ok(!/@import/i.test(css));
		assert.ok(!/url\(\s*['"]?https?:/i.test(css));
	});

	test('every element id the script looks up exists in the template', () => {
		const wanted = [...js.matchAll(/\$\('([A-Za-z]+)'\)/g)].map(m => m[1]);
		assert.ok(wanted.length > 5);
		for (const id of new Set(wanted)) {
			assert.ok(html.includes(`id="${id}"`), `template is missing id="${id}"`);
		}
	});

	test('the script only uses message type "update", matching what the panel sends', () => {
		assert.ok(js.includes("m.type !== 'update'"));
		const panel = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'ui', 'dashboardPanel.ts'), 'utf8');
		assert.ok(panel.includes("type: 'update'"));
	});
});

suite('dashboard score ring', () => {
	const html = read('dashboard.html');
	const css = read('dashboard.css');
	const js = read('dashboard.js');

	test('track and arc are concentric circles of the same radius', () => {
		const circles = [...html.matchAll(/<circle class="(ring-track|ring-arc)"[^>]*>/g)].map(m => m[0]);
		assert.strictEqual(circles.length, 2);
		const attr = (tag: string, name: string): string => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)![1];
		assert.strictEqual(attr(circles[0], 'r'), attr(circles[1], 'r'));
		assert.strictEqual(attr(circles[0], 'cx'), attr(circles[1], 'cx'));
		assert.strictEqual(attr(circles[0], 'cy'), attr(circles[1], 'cy'));
	});

	test('the stylesheet starts the arc empty, using the real circumference', () => {
		const radius = Number(/<circle class="ring-arc"[^>]* r="([\d.]+)"/.exec(html)![1]);
		const declared = Number(/--ring-circumference:\s*([\d.]+)/.exec(css)![1]);
		assert.ok(Math.abs(declared - 2 * Math.PI * radius) < 0.01, `CSS says ${declared}, the circle is ${2 * Math.PI * radius}`);
		assert.ok(/stroke-dashoffset:\s*var\(--ring-circumference\)/.test(css), 'the arc must start fully hidden');
	});

	test('the ring is announced as an image with a label that the script keeps up to date', () => {
		assert.ok(/id="ring" role="img" aria-label="[^"]+"/.test(html));
		assert.ok(js.includes("$('ring').setAttribute('aria-label'"));
		assert.ok(/<svg[^>]*aria-hidden="true"/.test(html), 'the drawing itself is decorative');
	});

	test('the arc animates its length and colour', () => {
		assert.ok(/\.ring-arc\s*\{[^}]*transition:[^;]*stroke-dashoffset/.test(css));
		assert.ok(/\.ring-arc\s*\{[^}]*transition:[^;]*stroke /.test(css));
	});

	test('the score number sits inside the ring, not beside it', () => {
		assert.ok(/<div class="ring"[\s\S]*?id="score"[\s\S]*?<\/div>\s*<\/div>/.test(html));
	});
});
