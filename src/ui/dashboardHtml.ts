import { randomBytes } from 'crypto';

export interface HtmlValues {
	cspSource: string;
	nonce: string;
	cssUri: string;
	jsUri: string;
}

export function newNonce(): string {
	return randomBytes(16).toString('base64');
}

/** No 'unsafe-inline': styles come from one file, and the one script must carry the nonce. */
export function buildCsp(cspSource: string, nonce: string): string {
	return [
		"default-src 'none'",
		`style-src ${cspSource}`,
		`script-src 'nonce-${nonce}'`,
	].join('; ');
}

const escapeAttr = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Fills the {{placeholders}} in the dashboard template. Unknown placeholders throw, so typos can't ship. */
export function renderDashboardHtml(template: string, values: HtmlValues): string {
	const fill: Record<string, string> = {
		csp: buildCsp(values.cspSource, values.nonce),
		nonce: values.nonce,
		cssUri: values.cssUri,
		jsUri: values.jsUri,
	};
	return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		if (!(key in fill)) {throw new Error(`Unknown placeholder {{${key}}} in the dashboard template`);}
		return escapeAttr(fill[key]);
	});
}
