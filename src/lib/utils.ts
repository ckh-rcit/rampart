import { WAF_ACTIONS } from '$lib/constants';
import type { WafAction } from '$lib/types';

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function escapeExpressionValue(input: string): string {
	return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function unescapeExpressionValue(input: string): string {
	return input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + '…';
}

export function actionLabel(action: WafAction): string {
	return WAF_ACTIONS.find((a) => a.value === action)?.label ?? action;
}

export function highlightExpression(expression: string): string {
	const regex =
		/(\$[A-Za-z0-9_]+)|(http\.[A-Za-z0-9_.]+|ip\.src[A-Za-z0-9_.]*|cf\.[A-Za-z0-9_.]+|ssl)|\b(not in|not|eq|ne|contains|matches|in|starts_with|ends_with|lt|le|gt|ge|wildcard|strict wildcard)\b|\b(and|or)\b/gi;
	let out = '';
	let lastIndex = 0;

	for (const match of expression.matchAll(regex)) {
		const index = match.index ?? 0;
		out += escapeHtml(expression.slice(lastIndex, index));

		if (match[1]) {
			out += `<span class="token-list">${escapeHtml(match[1])}</span>`;
		} else if (match[2]) {
			out += `<span class="token-field">${escapeHtml(match[2])}</span>`;
		} else if (match[3]) {
			out += `<span class="token-operator">${escapeHtml(match[3])}</span>`;
		} else if (match[4]) {
			out += `<span class="token-logical">${escapeHtml(match[4])}</span>`;
		}

		lastIndex = index + match[0].length;
	}

	out += escapeHtml(expression.slice(lastIndex));
	return out;
}
