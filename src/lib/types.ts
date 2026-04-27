export type WafAction = 'block' | 'challenge' | 'managed_challenge' | 'js_challenge' | 'skip' | 'log';
export type MatchFieldOptionValue =
	| 'http.request.full_uri'
	| 'http.request.uri'
	| 'http.request.uri.path'
	| 'http.request.uri.query'
	| 'ip.src.asnum'
	| 'http.cookie'
	| 'ip.src.country'
	| 'ip.src.continent'
	| 'http.host'
	| 'ip.src'
	| 'http.referer'
	| 'http.request.method'
	| 'ssl'
	| 'http.request.version'
	| 'http.user_agent'
	| 'http.x_forwarded_for'
	| 'cf.tls_client_auth.cert_verified'
	| 'ip.src.is_in_european_union'
	| 'cf.waf.score';

export type MatchOperatorOptionValue =
	| 'wildcard'
	| 'strict_wildcard'
	| 'equals'
	| 'not_equals'
	| 'contains'
	| 'not_contains'
	| 'matches_regex'
	| 'not_matches_regex'
	| 'starts_with'
	| 'not_starts_with'
	| 'ends_with'
	| 'not_ends_with'
	| 'less_than'
	| 'less_than_or_equal'
	| 'greater_than'
	| 'greater_than_or_equal'
	| 'in_set'
	| 'not_in_set'
	| 'in_list'
	| 'not_in_list';

export type MatchJoin = 'and' | 'or';
export type MatchEditorView = 'expression' | 'simple';

export interface MatchFieldOption {
	label: string;
	value: MatchFieldOptionValue;
	booleanToggleOnly?: boolean;
	numericOnly?: boolean;
}

export interface MatchOperatorOption {
	label: string;
	value: MatchOperatorOptionValue;
	numericOnly?: boolean;
}

export interface FieldValueOption {
	value: string;
	label: string;
}

export interface SimpleMatchCondition {
	id: number;
	joinWithPrevious: MatchJoin;
	field: MatchFieldOptionValue;
	operator: MatchOperatorOptionValue;
	value: string;
	booleanToggleOn: boolean;
}


export interface BlockResponse {
	status_code?: number;
	content?: string;
	content_type?: string;
}

export interface WafRule {
	id?: string;
	ref?: string;
	description?: string;
	expression: string;
	action: WafAction;
	enabled?: boolean;
	action_parameters?: {
		response?: BlockResponse;
	};
}

export interface ZoneSummary {
	id: string;
	name: string;
	accountId: string;
}

export interface CfList {
	id: string;
	name: string;
	kind: 'ip' | 'redirect' | 'hostname' | 'asn';
	num_items: number;
}

export interface RampartExportPayload {
	metadata: {
		zone: string;
		exportedAt: string;
	};
	rules: WafRule[];
}
