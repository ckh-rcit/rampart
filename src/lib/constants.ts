import type {
	WafAction,
	MatchFieldOption,
	MatchFieldOptionValue,
	MatchOperatorOption,
	MatchOperatorOptionValue,
	FieldValueOption
} from '$lib/types';

export type CustomBlockResponseContentType = 'text/html' | 'text/plain' | 'application/json' | 'text/xml';
export type BlockResponseTypeValue = 'default_waf_block_403' | CustomBlockResponseContentType;

export const DEFAULT_BLOCK_RESPONSE_TYPE: BlockResponseTypeValue = 'default_waf_block_403';

export const CUSTOM_BLOCK_RESPONSE_CONTENT_TYPES: CustomBlockResponseContentType[] = [
	'text/html',
	'text/plain',
	'application/json',
	'text/xml'
];

export const WAF_ACTIONS: { value: WafAction; label: string }[] = [
	{ value: 'block', label: 'Block' },
	{ value: 'managed_challenge', label: 'Managed Challenge' },
	{ value: 'challenge', label: 'Interactive Challenge' },
	{ value: 'js_challenge', label: 'JS Challenge' },
	{ value: 'skip', label: 'Skip' },
	{ value: 'log', label: 'Log (Enterprise)' }
];

export const BLOCK_RESPONSE_TYPES: { value: BlockResponseTypeValue; label: string }[] = [
	{ value: DEFAULT_BLOCK_RESPONSE_TYPE, label: 'Default Cloudflare WAF block page (403)' },
	{ value: 'text/html', label: 'Custom HTML' },
	{ value: 'text/plain', label: 'Custom Text' },
	{ value: 'application/json', label: 'Custom JSON' },
	{ value: 'text/xml', label: 'Custom XML' }
];

export const MATCH_FIELDS: MatchFieldOption[] = [
	{ label: 'URI Full', value: 'http.request.full_uri' },
	{ label: 'URI', value: 'http.request.uri' },
	{ label: 'URI Path', value: 'http.request.uri.path' },
	{ label: 'URI Query String', value: 'http.request.uri.query' },
	{ label: 'AS Num', value: 'ip.src.asnum' },
	{ label: 'Cookie', value: 'http.cookie' },
	{ label: 'Country', value: 'ip.src.country' },
	{ label: 'Continent', value: 'ip.src.continent' },
	{ label: 'Hostname', value: 'http.host' },
	{ label: 'IP Source Address', value: 'ip.src' },
	{ label: 'Referer', value: 'http.referer' },
	{ label: 'Request Method', value: 'http.request.method' },
	{ label: 'SSL/HTTPS', value: 'ssl', booleanToggleOnly: true },
	{ label: 'HTTP Version', value: 'http.request.version' },
	{ label: 'User Agent', value: 'http.user_agent' },
	{ label: 'X-Forwarded-For', value: 'http.x_forwarded_for' },
	{ label: 'Client Certificate Verified', value: 'cf.tls_client_auth.cert_verified', booleanToggleOnly: true },
	{ label: 'European Union', value: 'ip.src.is_in_european_union', booleanToggleOnly: true },
	{ label: 'WAF Attack Score', value: 'cf.waf.score', numericOnly: true }
];

export const MATCH_OPERATORS: MatchOperatorOption[] = [
	{ label: 'wildcard', value: 'wildcard' },
	{ label: 'strict wildcard', value: 'strict_wildcard' },
	{ label: 'equals', value: 'equals' },
	{ label: 'does not equal', value: 'not_equals' },
	{ label: 'contains', value: 'contains' },
	{ label: 'does not contain', value: 'not_contains' },
	{ label: 'matches regex', value: 'matches_regex' },
	{ label: 'does not match regex', value: 'not_matches_regex' },
	{ label: 'starts with', value: 'starts_with' },
	{ label: 'does not start with', value: 'not_starts_with' },
	{ label: 'ends with', value: 'ends_with' },
	{ label: 'does not end with', value: 'not_ends_with' },
	{ label: 'less than', value: 'less_than', numericOnly: true },
	{ label: 'less than or equal', value: 'less_than_or_equal', numericOnly: true },
	{ label: 'greater than', value: 'greater_than', numericOnly: true },
	{ label: 'greater than or equal', value: 'greater_than_or_equal', numericOnly: true },
	{ label: 'is in set', value: 'in_set' },
	{ label: 'is not in set', value: 'not_in_set' },
	{ label: 'is in list', value: 'in_list' },
	{ label: 'is not in list', value: 'not_in_list' }
];

export const DEFAULT_TEXT_OPERATORS: MatchOperatorOptionValue[] = [
	'wildcard',
	'strict_wildcard',
	'equals',
	'not_equals',
	'contains',
	'not_contains',
	'matches_regex',
	'not_matches_regex',
	'starts_with',
	'not_starts_with',
	'ends_with',
	'not_ends_with',
	'in_set',
	'not_in_set',
	'in_list',
	'not_in_list'
];

export const DEFAULT_NUMERIC_OPERATORS: MatchOperatorOptionValue[] = [
	'equals',
	'not_equals',
	'less_than',
	'less_than_or_equal',
	'greater_than',
	'greater_than_or_equal'
];

export const CONTINENT_VALUE_OPTIONS: FieldValueOption[] = [
	{ value: 'AF', label: 'Africa (AF)' },
	{ value: 'AN', label: 'Antarctica (AN)' },
	{ value: 'AS', label: 'Asia (AS)' },
	{ value: 'EU', label: 'Europe (EU)' },
	{ value: 'NA', label: 'North America (NA)' },
	{ value: 'OC', label: 'Oceania (OC)' },
	{ value: 'SA', label: 'South America (SA)' }
];

export const REQUEST_METHOD_VALUE_OPTIONS: FieldValueOption[] = [
	{ value: 'GET', label: 'GET' },
	{ value: 'HEAD', label: 'HEAD' },
	{ value: 'POST', label: 'POST' },
	{ value: 'PUT', label: 'PUT' },
	{ value: 'PATCH', label: 'PATCH' },
	{ value: 'DELETE', label: 'DELETE' },
	{ value: 'OPTIONS', label: 'OPTIONS' },
	{ value: 'TRACE', label: 'TRACE' },
	{ value: 'CONNECT', label: 'CONNECT' }
];

export const HTTP_VERSION_VALUE_OPTIONS: FieldValueOption[] = [
	{ value: 'HTTP/1.0', label: 'HTTP/1.0' },
	{ value: 'HTTP/1.1', label: 'HTTP/1.1' },
	{ value: 'HTTP/2', label: 'HTTP/2' },
	{ value: 'HTTP/3', label: 'HTTP/3' }
];

export const COUNTRY_VALUE_OPTIONS: FieldValueOption[] = (() => {
	try {
		const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		const options: FieldValueOption[] = [];
		for (const first of letters) {
			for (const second of letters) {
				const code = `${first}${second}`;
				const name = displayNames.of(code);
				if (!name || name === code || /unknown region/i.test(name)) continue;
				options.push({ value: code, label: `${name} (${code})` });
			}
		}
		return options.sort((a, b) => a.label.localeCompare(b.label));
	} catch {
		return [];
	}
})();

export const FIELD_OPERATOR_OVERRIDES: Partial<Record<MatchFieldOptionValue, MatchOperatorOptionValue[]>> = {
	'ip.src': ['equals', 'not_equals', 'in_set', 'not_in_set', 'in_list', 'not_in_list'],
	'ip.src.country': ['equals', 'not_equals', 'in_set', 'not_in_set', 'in_list', 'not_in_list'],
	'ip.src.continent': ['equals', 'not_equals', 'in_set', 'not_in_set', 'in_list', 'not_in_list'],
	'ip.src.asnum': ['equals', 'not_equals', 'in_set', 'not_in_set', 'in_list', 'not_in_list'],
	'http.request.method': ['equals', 'not_equals', 'in_set', 'not_in_set'],
	'http.request.version': ['equals', 'not_equals', 'in_set', 'not_in_set'],
	'cf.waf.score': DEFAULT_NUMERIC_OPERATORS
};
