<script lang="ts">
	import { onMount } from 'svelte';
	import type { WafRule, WafAction, ZoneSummary, CfList, RampartExportPayload } from '$lib/types';

	type Tab = 'manage' | 'create' | 'copy';
	type MatchEditorView = 'expression' | 'simple';
	type MatchJoin = 'and' | 'or';
	type MatchFieldOptionValue =
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
	type MatchOperatorOptionValue =
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

	interface MatchFieldOption {
		label: string;
		value: MatchFieldOptionValue;
		booleanToggleOnly?: boolean;
		numericOnly?: boolean;
	}

	interface MatchOperatorOption {
		label: string;
		value: MatchOperatorOptionValue;
		numericOnly?: boolean;
	}

	interface SimpleMatchCondition {
		id: number;
		joinWithPrevious: MatchJoin;
		field: MatchFieldOptionValue;
		operator: MatchOperatorOptionValue;
		value: string;
		booleanToggleOn: boolean;
	}

	interface ApiError {
		error?: string;
	}

	interface ZonesResponse extends ApiError {
		zones: ZoneSummary[];
	}

	interface RulesResponse extends ApiError {
		name?: string;
		rules?: WafRule[];
	}

	interface ExpressionValidateResponse extends ApiError {
		valid?: boolean;
	}

	type CustomBlockResponseContentType = 'text/html' | 'text/plain' | 'application/json' | 'text/xml';
	type BlockResponseTypeValue = 'default_waf_block_403' | CustomBlockResponseContentType;

	const CUSTOM_BLOCK_RESPONSE_CONTENT_TYPES: CustomBlockResponseContentType[] = [
		'text/html',
		'text/plain',
		'application/json',
		'text/xml'
	];

	const DEFAULT_BLOCK_RESPONSE_TYPE: BlockResponseTypeValue = 'default_waf_block_403';

	const WAF_ACTIONS: { value: WafAction; label: string }[] = [
		{ value: 'block', label: 'Block' },
		{ value: 'managed_challenge', label: 'Managed Challenge' },
		{ value: 'challenge', label: 'Interactive Challenge' },
		{ value: 'js_challenge', label: 'JS Challenge' },
		{ value: 'skip', label: 'Skip' },
		{ value: 'log', label: 'Log (Enterprise)' }
	];

	const BLOCK_RESPONSE_TYPES: { value: BlockResponseTypeValue; label: string }[] = [
		{ value: DEFAULT_BLOCK_RESPONSE_TYPE, label: 'Default Cloudflare WAF block page (403)' },
		{ value: 'text/html', label: 'Custom HTML' },
		{ value: 'text/plain', label: 'Custom Text' },
		{ value: 'application/json', label: 'Custom JSON' },
		{ value: 'text/xml', label: 'Custom XML' }
	];

	const MATCH_FIELDS: MatchFieldOption[] = [
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

	const MATCH_OPERATORS: MatchOperatorOption[] = [
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

	// ─── State ──────────────────────────────────────────────
	const zones = $state<ZoneSummary[]>([]);
	let zonesLoading = $state(false);
	let cfLists = $state<CfList[]>([]);
	let cfListsLoading = $state(false);
	let zoneQuery = $state('');
	let selectedZoneId = $state('');

	let activeTab = $state<Tab>('manage');
	let toast = $state<{ type: 'ok' | 'error'; message: string } | null>(null);
	let busy = $state(false);

	// Manage tab
	let existingRules = $state<WafRule[]>([]);
	let existingRulesetName = $state('Custom rules');
	let deleteConfirmIndex = $state<number | null>(null);
	let expandedRuleIndex = $state<number | null>(null);
	let expressionInputs: Array<HTMLTextAreaElement | null> = [];
	let expressionPreviews: Array<HTMLPreElement | null> = [];
	let matchEditorViews = $state<Record<number, MatchEditorView>>({});
	let simpleConditionsByRule = $state<Record<number, SimpleMatchCondition[]>>({});
	let simpleParseErrorsByRule = $state<Record<number, string>>({});
	let simpleConditionSeed = 0;
	const CREATE_EDITOR_INDEX = -1;

	// Create tab
	let createDescription = $state('');
	let createAction = $state<WafAction>('block');
	let createExpressionText = $state('');
	let createExpressionValidationError = $state('');
	let createBlockResponseType = $state<BlockResponseTypeValue>(DEFAULT_BLOCK_RESPONSE_TYPE);
	let createBlockStatusCode = $state(403);
	let createBlockBody = $state('');
	let createRuleValidated = $state(false);
	let existingExpressionValidationErrors = $state<Record<number, string>>({});

	// Cross-zone copy
	let copyTargetZoneIds = $state<Set<string>>(new Set());
	let copySelection = $state<Set<number>>(new Set());
	let copyTargetQuery = $state('');

	// Import
	let showImportDialog = $state(false);
	let importText = $state('');
	let importMode = $state<'json' | 'text'>('json');
	let importDefaultAction = $state<WafAction>('block');

	// ─── Derived ────────────────────────────────────────────

	function getMatchingZones(query: string): ZoneSummary[] {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return zones;
		return zones.filter((zone) => zone.name.toLowerCase().includes(normalized));
	}

	const filteredZones = $derived(getMatchingZones(zoneQuery));
	const filteredCopyTargetZones = $derived(getMatchingZones(copyTargetQuery));
	const selectedZoneName = $derived(zones.find((z) => z.id === selectedZoneId)?.name ?? '');

	$effect(() => {
		if (zonesLoading) return;
		if (filteredZones.length === 0) return;
		if (selectedZoneId && !filteredZones.some((zone) => zone.id === selectedZoneId)) {
			selectedZoneId = '';
		}
	});

	$effect(() => {
		if (zonesLoading) return;

		const query = zoneQuery.trim().toLowerCase();
		if (!query) return;
		if (filteredZones.length === 0) return;

		const exactMatch = filteredZones.find((zone) => zone.name.toLowerCase() === query);
		const nextZone = exactMatch ?? (filteredZones.length === 1 ? filteredZones[0] : null);

		if (nextZone && selectedZoneId !== nextZone.id) {
			selectedZoneId = nextZone.id;
		}
	});

	// ─── Helpers ────────────────────────────────────────────

	function showToast(type: 'ok' | 'error', message: string): void {
		toast = { type, message };
		setTimeout(() => {
			if (toast?.message === message) toast = null;
		}, 4500);
	}

	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function escapeExpressionValue(input: string): string {
		return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	}

	function unescapeExpressionValue(input: string): string {
		return input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
	}

	function truncate(text: string, max: number): string {
		if (text.length <= max) return text;
		return text.slice(0, max) + '…';
	}

	function actionLabel(action: WafAction): string {
		return WAF_ACTIONS.find((a) => a.value === action)?.label ?? action;
	}

	function isCustomBlockResponseType(type: string | undefined): type is CustomBlockResponseContentType {
		return CUSTOM_BLOCK_RESPONSE_CONTENT_TYPES.includes(type as CustomBlockResponseContentType);
	}

	function ensureRuleBlockResponse(rule: WafRule): NonNullable<NonNullable<WafRule['action_parameters']>['response']> {
		rule.action_parameters ??= {};
		rule.action_parameters.response ??= {};
		return rule.action_parameters.response;
	}

	function clearRuleBlockResponse(rule: WafRule): void {
		if (!rule.action_parameters) return;
		delete rule.action_parameters.response;
		if (Object.keys(rule.action_parameters).length === 0) {
			delete rule.action_parameters;
		}
	}

	function getRuleBlockResponseType(rule: WafRule): BlockResponseTypeValue {
		const contentType = rule.action_parameters?.response?.content_type;
		if (!isCustomBlockResponseType(contentType)) return DEFAULT_BLOCK_RESPONSE_TYPE;
		return contentType;
	}

	function getRuleBlockStatusCode(rule: WafRule): number {
		return rule.action_parameters?.response?.status_code ?? 403;
	}

	function getRuleBlockBody(rule: WafRule): string {
		return rule.action_parameters?.response?.content ?? '';
	}

	function onRuleBlockResponseTypeChange(rule: WafRule, selectedValue: string): void {
		const selected = selectedValue as BlockResponseTypeValue;
		if (selected === DEFAULT_BLOCK_RESPONSE_TYPE) {
			clearRuleBlockResponse(rule);
			return;
		}

		const response = ensureRuleBlockResponse(rule);
		response.content_type = selected;
		response.status_code ??= 403;
		response.content ??= '';
	}

	function onRuleBlockStatusCodeInput(rule: WafRule, rawValue: string): void {
		if (getRuleBlockResponseType(rule) === DEFAULT_BLOCK_RESPONSE_TYPE) return;
		const response = ensureRuleBlockResponse(rule);
		response.status_code = parseInt(rawValue, 10) || 403;
	}

	function onRuleBlockBodyInput(rule: WafRule, body: string): void {
		if (getRuleBlockResponseType(rule) === DEFAULT_BLOCK_RESPONSE_TYPE) return;
		const response = ensureRuleBlockResponse(rule);
		response.content = body;
	}

	function sanitizeRuleForSubmission(rule: WafRule): WafRule {
		if (rule.action !== 'block') return rule;

		const response = rule.action_parameters?.response;
		if (!response) return rule;

		const contentType = response.content_type;
		const content = response.content?.trim() ?? '';

		if (!isCustomBlockResponseType(contentType) || !content) {
			const sanitized: WafRule = { ...rule, action_parameters: rule.action_parameters ? { ...rule.action_parameters } : undefined };
			clearRuleBlockResponse(sanitized);
			return sanitized;
		}

		return {
			...rule,
			action_parameters: {
				...(rule.action_parameters ?? {}),
				response: {
					status_code: response.status_code ?? 403,
					content,
					content_type: contentType
				}
			}
		};
	}

	function sanitizeRulesForSubmission(rules: WafRule[]): WafRule[] {
		return rules.map((rule) => sanitizeRuleForSubmission(rule));
	}

	async function validateExpressionWithApi(expression: string): Promise<string | null> {
		const trimmed = expression.trim();
		if (!trimmed) return 'Expression is required.';

		try {
			const response = await fetch('/api/expressions/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ expression: trimmed })
			});
			const data = (await response.json()) as ExpressionValidateResponse;
			if (!response.ok || data.valid === false) {
				return data.error || 'Expression is invalid.';
			}
			return null;
		} catch {
			return 'Could not validate expression with Cloudflare. Please try again.';
		}
	}

	async function validateExistingRuleExpressions(rules: WafRule[]): Promise<boolean> {
		const errorsByIndex: Record<number, string> = {};

		for (const [index, rule] of rules.entries()) {
			const validationError = await validateExpressionWithApi(rule.expression ?? '');
			if (validationError) {
				errorsByIndex[index] = validationError;
			}
		}

		existingExpressionValidationErrors = errorsByIndex;
		return Object.keys(errorsByIndex).length === 0;
	}

	function clearExistingExpressionValidationError(index: number): void {
		if (!existingExpressionValidationErrors[index]) return;
		const next = { ...existingExpressionValidationErrors };
		delete next[index];
		existingExpressionValidationErrors = next;
	}

	function toggleExpandRule(index: number): void {
		expandedRuleIndex = expandedRuleIndex === index ? null : index;
	}

	function highlightExpression(expression: string): string {
		const regex = /(\$[A-Za-z0-9_]+)|(http\.[A-Za-z0-9_.]+|ip\.src[A-Za-z0-9_.]*|cf\.[A-Za-z0-9_.]+|ssl)|\b(not in|not|eq|ne|contains|matches|in|starts_with|ends_with|lt|le|gt|ge|wildcard|strict wildcard)\b|\b(and|or)\b/gi;
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

	function syncExpressionScroll(index: number): void {
		const input = expressionInputs[index];
		const preview = expressionPreviews[index];
		if (!input || !preview) return;
		preview.scrollTop = input.scrollTop;
		preview.scrollLeft = input.scrollLeft;
	}

	function isBooleanToggleField(field: MatchFieldOptionValue): boolean {
		return MATCH_FIELDS.some((f) => f.value === field && f.booleanToggleOnly);
	}

	function isNumericField(field: MatchFieldOptionValue): boolean {
		return MATCH_FIELDS.some((f) => f.value === field && f.numericOnly);
	}

	function isListOperator(op: MatchOperatorOptionValue): boolean {
		return op === 'in_list' || op === 'not_in_list';
	}

	function isSetOperator(op: MatchOperatorOptionValue): boolean {
		return op === 'in_set' || op === 'not_in_set';
	}

	function simpleValuePlaceholder(op: MatchOperatorOptionValue): string {
		if (isSetOperator(op)) return '203.0.113.0/24 198.51.100.0/24';
		return '';
	}

	function nextSimpleConditionId(): number {
		simpleConditionSeed += 1;
		return simpleConditionSeed;
	}

	function defaultSimpleCondition(joinWithPrevious: MatchJoin = 'and'): SimpleMatchCondition {
		return {
			id: nextSimpleConditionId(),
			joinWithPrevious,
			field: 'http.request.full_uri',
			operator: 'equals',
			value: '',
			booleanToggleOn: true
		};
	}

	// ─── Simple View expression builder ─────────────────────

	function buildClauseFromSimpleCondition(condition: SimpleMatchCondition): string {
		const field = condition.field;

		if (isBooleanToggleField(field)) {
			return condition.booleanToggleOn ? `(${field})` : `(not ${field})`;
		}

		const escaped = escapeExpressionValue(condition.value ?? '');

		switch (condition.operator) {
			case 'wildcard':
				return `(${field} wildcard r"${escaped}")`;
			case 'strict_wildcard':
				return `(${field} strict wildcard r"${escaped}")`;
			case 'equals':
				return `(${field} eq "${escaped}")`;
			case 'not_equals':
				return `(${field} ne "${escaped}")`;
			case 'contains':
				return `(${field} contains "${escaped}")`;
			case 'not_contains':
				return `(not ${field} contains "${escaped}")`;
			case 'matches_regex':
				return `(${field} matches r"${escaped}")`;
			case 'not_matches_regex':
				return `(not ${field} matches r"${escaped}")`;
			case 'starts_with':
				return `(starts_with(${field}, "${escaped}"))`;
			case 'not_starts_with':
				return `(not starts_with(${field}, "${escaped}"))`;
			case 'ends_with':
				return `(ends_with(${field}, "${escaped}"))`;
			case 'not_ends_with':
				return `(not ends_with(${field}, "${escaped}"))`;
			case 'less_than':
				return `(${field} lt ${condition.value})`;
			case 'less_than_or_equal':
				return `(${field} le ${condition.value})`;
			case 'greater_than':
				return `(${field} gt ${condition.value})`;
			case 'greater_than_or_equal':
				return `(${field} ge ${condition.value})`;
			case 'in_set':
				return `(${field} in {${(condition.value ?? '').trim()}})`;
			case 'not_in_set':
				return `(not ${field} in {${(condition.value ?? '').trim()}})`;
			case 'in_list':
				return `(${field} in $${condition.value})`;
			case 'not_in_list':
				return `(not ${field} in $${condition.value})`;
			default:
				return `(${field} eq "${escaped}")`;
		}
	}

	function getExpressionForEditor(index: number): string {
		if (index === CREATE_EDITOR_INDEX) return createExpressionText;
		return existingRules[index]?.expression ?? '';
	}

	function setExpressionForEditor(index: number, expression: string): void {
		if (index === CREATE_EDITOR_INDEX) {
			createExpressionText = expression;
			createExpressionValidationError = '';
			createRuleValidated = false;
			return;
		}
		if (!existingRules[index]) return;
		existingRules[index].expression = expression;
		clearExistingExpressionValidationError(index);
	}

	function rebuildRuleExpressionFromSimple(index: number): void {
		const conditions = simpleConditionsByRule[index] ?? [];
		if (conditions.length === 0) return;

		const expression = conditions
			.map((condition, conditionIndex) => {
				const clause = buildClauseFromSimpleCondition(condition);
				if (conditionIndex === 0) return clause;
				return `${condition.joinWithPrevious} ${clause}`;
			})
			.join(' ');

		setExpressionForEditor(index, expression);
	}

	function getMatchEditorView(index: number): MatchEditorView {
		return matchEditorViews[index] ?? 'expression';
	}

	function parseSimpleClause(trimmed: string): Omit<SimpleMatchCondition, 'id' | 'joinWithPrevious'> | null {
		const boolTrue = trimmed.match(/^\((ssl|cf\.tls_client_auth\.cert_verified|ip\.src\.is_in_european_union)\)$/);
		if (boolTrue) {
			return { field: boolTrue[1] as MatchFieldOptionValue, operator: 'equals', value: '', booleanToggleOn: true };
		}

		const boolFalse = trimmed.match(/^\(not\s+(ssl|cf\.tls_client_auth\.cert_verified|ip\.src\.is_in_european_union)\)$/);
		if (boolFalse) {
			return { field: boolFalse[1] as MatchFieldOptionValue, operator: 'equals', value: '', booleanToggleOn: false };
		}

		const numeric = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+(lt|le|gt|ge)\s+(-?\d+)\)$/
		);
		if (numeric) {
			const map: Record<string, MatchOperatorOptionValue> = { lt: 'less_than', le: 'less_than_or_equal', gt: 'greater_than', ge: 'greater_than_or_equal' };
			return { field: numeric[1] as MatchFieldOptionValue, operator: map[numeric[2]], value: numeric[3], booleanToggleOn: true };
		}

		const direct = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+|ssl)\s+(wildcard|strict wildcard|eq|ne|contains|matches)\s+(r?)"((?:\\.|[^"\\])*)"\)$/
		);
		if (direct) {
			const map: Record<string, MatchOperatorOptionValue> = {
				wildcard: 'wildcard',
				'strict wildcard': 'strict_wildcard',
				eq: 'equals',
				ne: 'not_equals',
				contains: 'contains',
				matches: 'matches_regex'
			};
			const op = map[direct[2]];
			if (!op) return null;
			return { field: direct[1] as MatchFieldOptionValue, operator: op, value: unescapeExpressionValue(direct[4]), booleanToggleOn: true };
		}

		const negDirect = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+(contains|matches)\s+(r?)"((?:\\.|[^"\\])*)"\)$/
		);
		if (negDirect) {
			const map: Record<string, MatchOperatorOptionValue> = { contains: 'not_contains', matches: 'not_matches_regex' };
			const op = map[negDirect[2]];
			if (!op) return null;
			return { field: negDirect[1] as MatchFieldOptionValue, operator: op, value: unescapeExpressionValue(negDirect[4]), booleanToggleOn: true };
		}

		const fnDirect = trimmed.match(
			/^\((starts_with|ends_with)\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+),\s*"((?:\\.|[^"\\])*)"\)\)$/
		);
		if (fnDirect) {
			return { field: fnDirect[2] as MatchFieldOptionValue, operator: fnDirect[1] === 'starts_with' ? 'starts_with' : 'ends_with', value: unescapeExpressionValue(fnDirect[3]), booleanToggleOn: true };
		}

		const fnNeg = trimmed.match(
			/^\(not\s+(starts_with|ends_with)\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+),\s*"((?:\\.|[^"\\])*)"\)\)$/
		);
		if (fnNeg) {
			return { field: fnNeg[2] as MatchFieldOptionValue, operator: fnNeg[1] === 'starts_with' ? 'not_starts_with' : 'not_ends_with', value: unescapeExpressionValue(fnNeg[3]), booleanToggleOn: true };
		}

		const inSet = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\{([^}]*)\}\)$/
		);
		if (inSet) {
			return { field: inSet[1] as MatchFieldOptionValue, operator: 'in_set', value: inSet[2].trim(), booleanToggleOn: true };
		}

		const notInSet = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\{([^}]*)\}\)$/
		);
		if (notInSet) {
			return { field: notInSet[1] as MatchFieldOptionValue, operator: 'not_in_set', value: notInSet[2].trim(), booleanToggleOn: true };
		}

		const inList = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\$([A-Za-z0-9_]+)\)$/
		);
		if (inList) {
			return { field: inList[1] as MatchFieldOptionValue, operator: 'in_list', value: inList[2], booleanToggleOn: true };
		}

		const notInList = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\$([A-Za-z0-9_]+)\)$/
		);
		if (notInList) {
			return { field: notInList[1] as MatchFieldOptionValue, operator: 'not_in_list', value: notInList[2], booleanToggleOn: true };
		}

		return null;
	}

	function splitTopLevelClauses(expression: string): Array<{ joinWithPrevious: MatchJoin; clause: string }> | null {
		const out: Array<{ joinWithPrevious: MatchJoin; clause: string }> = [];
		let depth = 0;
		let inQuote = false;
		let current = '';
		let pendingJoin: MatchJoin = 'and';

		for (let i = 0; i < expression.length; i += 1) {
			const char = expression[i];
			const prev = i > 0 ? expression[i - 1] : '';

			if (char === '"' && prev !== '\\') {
				inQuote = !inQuote;
				current += char;
				continue;
			}

			if (!inQuote) {
				if (char === '(') depth += 1;
				if (char === ')') depth -= 1;
				if (depth < 0) return null;

				if (depth === 0 && expression.startsWith(' and ', i)) {
					out.push({ joinWithPrevious: pendingJoin, clause: current.trim() });
					current = '';
					pendingJoin = 'and';
					i += 4;
					continue;
				}

				if (depth === 0 && expression.startsWith(' or ', i)) {
					out.push({ joinWithPrevious: pendingJoin, clause: current.trim() });
					current = '';
					pendingJoin = 'or';
					i += 3;
					continue;
				}
			}

			current += char;
		}

		if (inQuote || depth !== 0) return null;
		if (current.trim()) out.push({ joinWithPrevious: pendingJoin, clause: current.trim() });
		return out.length > 0 ? out : null;
	}

	function isFullyWrappedExpression(expression: string): boolean {
		const trimmed = expression.trim();
		if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return false;

		let depth = 0;
		let inQuote = false;
		for (let i = 0; i < trimmed.length; i += 1) {
			const char = trimmed[i];
			const prev = i > 0 ? trimmed[i - 1] : '';

			if (char === '"' && prev !== '\\') {
				inQuote = !inQuote;
				continue;
			}
			if (inQuote) continue;

			if (char === '(') depth += 1;
			if (char === ')') depth -= 1;
			if (depth === 0 && i < trimmed.length - 1) return false;
			if (depth < 0) return false;
		}

		return depth === 0;
	}

	function unwrapOuterCompoundGroup(expression: string): string {
		let current = expression.trim();
		while (isFullyWrappedExpression(current)) {
			const inner = current.slice(1, -1).trim();
			const innerParts = splitTopLevelClauses(inner);
			if (innerParts && innerParts.length > 1) {
				current = inner;
				continue;
			}
			break;
		}
		return current;
	}

	function parseExpressionToSimpleConditions(expression: string): SimpleMatchCondition[] | null {
		const source = unwrapOuterCompoundGroup(expression);
		const parts = splitTopLevelClauses(source);
		if (!parts) return null;

		const parsed: SimpleMatchCondition[] = [];

		for (const [index, part] of parts.entries()) {
			const rawClause = part.clause.trim();
			const normalizedClause = rawClause.startsWith('(') ? rawClause : `(${rawClause})`;
			const clause = parseSimpleClause(normalizedClause);
			if (!clause) return null;
			if (!MATCH_FIELDS.some((field) => field.value === clause.field)) return null;

			parsed.push({
				id: nextSimpleConditionId(),
				joinWithPrevious: index === 0 ? 'and' : part.joinWithPrevious,
				...clause
			});
		}

		return parsed;
	}

	function initializeSimpleModeForRule(index: number): void {
		const parsed = parseExpressionToSimpleConditions(getExpressionForEditor(index) || '');
		if (!parsed) {
			simpleParseErrorsByRule[index] =
				'This expression cannot be represented in Simple View. Switch to Expression View to edit it directly.';
			simpleConditionsByRule[index] = [defaultSimpleCondition()];
			return;
		}
		simpleParseErrorsByRule[index] = '';
		simpleConditionsByRule[index] = parsed;
	}

	function setMatchEditorView(index: number, view: MatchEditorView): void {
		matchEditorViews[index] = view;
		if (view === 'simple') {
			initializeSimpleModeForRule(index);
		}
	}

	function addSimpleCondition(index: number, joinWithPrevious: MatchJoin): void {
		const current = simpleConditionsByRule[index] ?? [defaultSimpleCondition()];
		simpleConditionsByRule[index] = [...current, defaultSimpleCondition(joinWithPrevious)];
		rebuildRuleExpressionFromSimple(index);
	}

	function removeSimpleCondition(index: number, conditionId: number): void {
		const current = simpleConditionsByRule[index] ?? [];
		if (current.length <= 1) return;
		const filtered = current.filter((c) => c.id !== conditionId);
		if (filtered.length > 0) filtered[0].joinWithPrevious = 'and';
		simpleConditionsByRule[index] = filtered;
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleFieldChange(index: number, conditionId: number, field: MatchFieldOptionValue): void {
		const current = simpleConditionsByRule[index] ?? [];
		for (const c of current) {
			if (c.id !== conditionId) continue;
			c.field = field;
			if (isBooleanToggleField(field)) {
				c.operator = 'equals';
				c.value = '';
				c.booleanToggleOn = true;
			}
			if (isNumericField(field)) {
				c.operator = 'less_than';
			}
		}
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleOperatorChange(index: number, conditionId: number, operator: MatchOperatorOptionValue): void {
		const current = simpleConditionsByRule[index] ?? [];
		for (const c of current) {
			if (c.id !== conditionId) continue;
			c.operator = operator;
		}
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleJoinChange(index: number, conditionId: number, join: MatchJoin): void {
		const current = simpleConditionsByRule[index] ?? [];
		for (const c of current) {
			if (c.id !== conditionId) continue;
			c.joinWithPrevious = join;
		}
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleValueChange(index: number): void {
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleBooleanToggleChange(index: number): void {
		rebuildRuleExpressionFromSimple(index);
	}

	function resetSimpleExpression(index: number): void {
		simpleParseErrorsByRule[index] = '';
		simpleConditionsByRule[index] = [defaultSimpleCondition()];
		rebuildRuleExpressionFromSimple(index);
	}

	// ─── API calls ──────────────────────────────────────────

	async function loadZones(): Promise<void> {
		zonesLoading = true;
		try {
			const response = await fetch('/api/zones');
			const data = (await response.json()) as ZonesResponse;
			if (!response.ok) throw new Error(data.error || 'Failed to load zones');
			zones.splice(0, zones.length, ...(data.zones ?? []));
			// Load lists from the first zone's account
			if (zones.length > 0) {
				loadLists(zones[0].accountId);
			}
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Could not load zones');
		} finally {
			zonesLoading = false;
		}
	}

	async function loadLists(accountId: string): Promise<void> {
		cfListsLoading = true;
		try {
			const response = await fetch(`/api/lists?accountId=${encodeURIComponent(accountId)}`);
			const data = (await response.json()) as { lists?: CfList[]; error?: string };
			if (!response.ok) throw new Error(data.error || 'Failed to load lists');
			cfLists = data.lists ?? [];
		} catch {
			// Lists are optional — don't block the UI
			cfLists = [];
		} finally {
			cfListsLoading = false;
		}
	}

	async function loadExistingRules(): Promise<void> {
		if (!selectedZoneId) return;
		busy = true;
		try {
			const response = await fetch(`/api/zones/${selectedZoneId}/rules`);
			const data = (await response.json()) as RulesResponse;
			if (!response.ok) throw new Error(data.error || 'Failed to load rules');
			existingRulesetName = data.name || 'Custom rules';
			existingRules = data.rules || [];
			existingExpressionValidationErrors = {};
			expandedRuleIndex = null;
			showToast('ok', `Loaded ${existingRules.length} existing rule(s).`);
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Failed to load rules');
		} finally {
			busy = false;
		}
	}

	async function saveExistingRules(): Promise<void> {
		if (!selectedZoneId) return;
		busy = true;
		try {
			const valid = await validateExistingRuleExpressions(existingRules);
			if (!valid) {
				throw new Error('One or more rule expressions are invalid. Expand the affected rules to review errors.');
			}

			const sanitizedRules = sanitizeRulesForSubmission(existingRules);
			const response = await fetch(`/api/zones/${selectedZoneId}/rules`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: existingRulesetName, rules: sanitizedRules })
			});
			const data = (await response.json()) as RulesResponse;
			if (!response.ok) throw new Error(data.error || 'Save failed');
			existingRules = data.rules || [];
			existingExpressionValidationErrors = {};
			showToast('ok', 'Rules saved successfully.');
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Save failed');
		} finally {
			busy = false;
		}
	}

	function requestDeleteRule(index: number): void {
		deleteConfirmIndex = index;
	}

	function confirmDeleteRule(): void {
		if (deleteConfirmIndex === null) return;
		existingRules = existingRules.filter((_, i) => i !== deleteConfirmIndex);
		deleteConfirmIndex = null;
		showToast('ok', 'Rule removed locally. Click Save Changes to deploy deletion.');
	}

	// ─── Create tab ─────────────────────────────────────────

	function buildCreateRule(): WafRule {
		const rule: WafRule = {
			description: createDescription.trim(),
			expression: createExpressionText.trim(),
			action: createAction,
			enabled: true
		};

		if (createAction === 'block' && createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE && createBlockBody.trim()) {
			rule.action_parameters = {
				response: {
					status_code: createBlockStatusCode,
					content: createBlockBody.trim(),
					content_type: createBlockResponseType
				}
			};
		}

		return rule;
	}

	function resetCreateForm(): void {
		createDescription = '';
		createAction = 'block';
		createExpressionText = '';
		createExpressionValidationError = '';
		createRuleValidated = false;
		createBlockResponseType = DEFAULT_BLOCK_RESPONSE_TYPE;
		createBlockStatusCode = 403;
		createBlockBody = '';
		delete matchEditorViews[CREATE_EDITOR_INDEX];
		delete simpleConditionsByRule[CREATE_EDITOR_INDEX];
		delete simpleParseErrorsByRule[CREATE_EDITOR_INDEX];
	}

	async function validateCreateRule(): Promise<void> {
		createRuleValidated = false;
		try {
			if (!createExpressionText.trim()) throw new Error('Expression is required.');
			const expressionError = await validateExpressionWithApi(createExpressionText);
			createExpressionValidationError = expressionError ?? '';
			if (expressionError) throw new Error('Expression is invalid.');

			if (
				createAction === 'block' &&
				createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE &&
				!createBlockBody.trim()
			) {
				throw new Error('Response body is required when using a custom block response.');
			}
			createRuleValidated = true;
			showToast('ok', 'Rule is valid — ready to deploy.');
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Validation failed');
		}
	}

	async function deployReplace(): Promise<void> {
		if (!selectedZoneId || !createRuleValidated) return;
		busy = true;
		try {
			const rule = sanitizeRuleForSubmission(buildCreateRule());
			const response = await fetch(`/api/zones/${selectedZoneId}/rules`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: existingRulesetName, rules: [rule] })
			});
			const data = (await response.json()) as RulesResponse;
			if (!response.ok) throw new Error(data.error || 'Deploy failed');
			existingRules = data.rules ?? [];
			showToast('ok', 'Rule deployed — replaced entire ruleset.');
			resetCreateForm();
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Deploy failed');
		} finally {
			busy = false;
		}
	}

	async function deployAppend(): Promise<void> {
		if (!selectedZoneId || !createRuleValidated) return;
		busy = true;
		try {
			const loadRes = await fetch(`/api/zones/${selectedZoneId}/rules`);
			const loadData = (await loadRes.json()) as RulesResponse;
			if (!loadRes.ok) throw new Error(loadData.error || 'Failed to load existing rules');

			const rule = sanitizeRuleForSubmission(buildCreateRule());
			const merged = [...(loadData.rules ?? []), rule];
			const response = await fetch(`/api/zones/${selectedZoneId}/rules`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: loadData.name ?? existingRulesetName,
					rules: sanitizeRulesForSubmission(merged)
				})
			});
			const data = (await response.json()) as RulesResponse;
			if (!response.ok) throw new Error(data.error || 'Deploy failed');
			existingRules = data.rules ?? [];
			showToast('ok', `Rule appended — zone now has ${(data.rules ?? []).length} rule(s).`);
			resetCreateForm();
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Deploy failed');
		} finally {
			busy = false;
		}
	}

	// ─── Cross-zone copy ────────────────────────────────────

	function toggleCopySelection(index: number): void {
		const next = new Set(copySelection);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		copySelection = next;
	}

	function selectAllForCopy(): void {
		copySelection = new Set(existingRules.map((_, i) => i));
	}

	function deselectAllForCopy(): void {
		copySelection = new Set();
	}

	function toggleCopyTargetZone(zoneId: string): void {
		const next = new Set(copyTargetZoneIds);
		if (next.has(zoneId)) next.delete(zoneId);
		else next.add(zoneId);
		copyTargetZoneIds = next;
	}

	function selectAllCopyTargets(): void {
		copyTargetZoneIds = new Set(
			filteredCopyTargetZones.filter((z) => z.id !== selectedZoneId).map((z) => z.id)
		);
	}

	function deselectAllCopyTargets(): void {
		copyTargetZoneIds = new Set();
	}

	async function executeCopy(): Promise<void> {
		if (copyTargetZoneIds.size === 0 || copySelection.size === 0) return;
		busy = true;

		const rulesToCopy = existingRules
			.filter((_, i) => copySelection.has(i))
			.map((rule) => {
				const { id, ref, ...rest } = rule;
				return rest;
			});

		const succeeded: string[] = [];
		const failed: string[] = [];

		for (const targetId of copyTargetZoneIds) {
			try {
				const loadRes = await fetch(`/api/zones/${targetId}/rules`);
				const loadData = (await loadRes.json()) as RulesResponse;
				if (!loadRes.ok) throw new Error(loadData.error || 'Failed to load target zone rules');

				const merged = [...(loadData.rules ?? []), ...rulesToCopy];
				const response = await fetch(`/api/zones/${targetId}/rules`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: loadData.name ?? 'Custom rules', rules: merged })
				});
				const data = (await response.json()) as RulesResponse;
				if (!response.ok) throw new Error(data.error || 'Copy failed');

				const targetName = zones.find((z) => z.id === targetId)?.name ?? targetId;
				succeeded.push(targetName);
			} catch {
				const targetName = zones.find((z) => z.id === targetId)?.name ?? targetId;
				failed.push(targetName);
			}
		}

		if (succeeded.length > 0) {
			showToast('ok', `Copied ${rulesToCopy.length} rule(s) to ${succeeded.length} zone(s): ${succeeded.join(', ')}`);
		}
		if (failed.length > 0) {
			showToast('error', `Failed to copy to: ${failed.join(', ')}`);
		}

		busy = false;
	}

	// ─── Import / Export ────────────────────────────────────

	function exportJson(): void {
		if (existingRules.length === 0) {
			showToast('error', 'No rules to export.');
			return;
		}
		const payload: RampartExportPayload = {
			metadata: { zone: selectedZoneName, exportedAt: new Date().toISOString() },
			rules: existingRules
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `rampart-export-${selectedZoneName}-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function exportExpressions(): void {
		if (existingRules.length === 0) {
			showToast('error', 'No rules to export.');
			return;
		}
		const lines = existingRules.map((r) =>
			`${r.description ?? '(unnamed)'} | ${r.expression} | ${r.action}`
		);
		const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `rampart-expressions-${selectedZoneName}-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImport(): void {
		try {
			if (importMode === 'json') {
				const parsed = JSON.parse(importText) as RampartExportPayload | WafRule[];
				const rules = Array.isArray(parsed) ? parsed : parsed.rules;
				if (!Array.isArray(rules) || rules.length === 0) throw new Error('No rules found in JSON.');
				existingRules = [...existingRules, ...rules];
				showToast('ok', `Imported ${rules.length} rule(s) — review and save in Manage tab.`);
			} else {
				const lines = importText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
				if (lines.length === 0) throw new Error('No lines found.');
				const rules: WafRule[] = lines.map((line) => {
					const parts = line.split('|').map((p) => p.trim());
					if (parts.length >= 3) {
						return {
							description: parts[0],
							expression: parts[1],
							action: (parts[2] as WafAction) || importDefaultAction,
							enabled: true
						};
					}
					if (parts.length === 2) {
						return {
							description: parts[0],
							expression: parts[1],
							action: importDefaultAction,
							enabled: true
						};
					}
					return {
						description: '',
						expression: line,
						action: importDefaultAction,
						enabled: true
					};
				});
				existingRules = [...existingRules, ...rules];
				showToast('ok', `Imported ${rules.length} rule(s) — review and save in Manage tab.`);
			}
			showImportDialog = false;
			importText = '';
			activeTab = 'manage';
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Import failed');
		}
	}

	function onImportFileUpload(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		file.text().then((text) => {
			importText = text;
			if (file.name.endsWith('.json')) importMode = 'json';
			else importMode = 'text';
		});
	}

	onMount(loadZones);

	$effect(() => {
		if (selectedZoneId) {
			loadExistingRules();
		}
	});
</script>

<!-- ─── Zone Selector ──────────────────────────────────── -->
<div class="panel">
	<div class="row" style="gap: 0.5rem;">
		<div class="stack" style="gap: 0.3rem; flex: 1;">
			<label class="muted" for="zone-filter">Filter</label>
			<input
				id="zone-filter"
				class="input"
				type="text"
				placeholder="Filter zones…"
				bind:value={zoneQuery}
			/>
		</div>
		<div class="stack" style="gap: 0.3rem; flex: 1;">
			<label class="muted" for="zone-select">Zone</label>
			<select id="zone-select" class="select" bind:value={selectedZoneId} disabled={zonesLoading}>
				{#if zonesLoading}
					<option value="">Loading zones…</option>
				{:else if filteredZones.length === 0}
					<option value="">No matching zones</option>
				{:else}
					<option value="">Select a zone…</option>
					{#each filteredZones as zone (zone.id)}
						<option value={zone.id}>{zone.name}</option>
					{/each}
				{/if}
			</select>
		</div>
	</div>
</div>

<!-- ─── Tab Bar ─────────────────────────────────────────── -->
<section class="panel stack" style="margin-top: 0.65rem;">
	<div class="row" style="gap: 0.35rem; margin-bottom: 0.55rem;">
		<button type="button" class="button {activeTab === 'manage' ? '' : 'secondary'}" onclick={() => (activeTab = 'manage')}>
			Manage Rules
		</button>
		<button type="button" class="button {activeTab === 'create' ? '' : 'secondary'}" onclick={() => (activeTab = 'create')}>
			Create Rules
		</button>
		<button type="button" class="button {activeTab === 'copy' ? '' : 'secondary'}" onclick={() => (activeTab = 'copy')}>
			Cross-Zone Copy
		</button>
	</div>

	<!-- ─── MANAGE TAB ──────────────────────────────────── -->
	{#if activeTab === 'manage'}
		<div class="stack">
			<div class="row">
				<button class="button secondary" type="button" onclick={loadExistingRules} disabled={busy || !selectedZoneId}>
					Refresh
				</button>
				<button class="button save" type="button" onclick={saveExistingRules} disabled={busy || !selectedZoneId}>
					Save Changes
				</button>
				<button class="button secondary" type="button" onclick={exportJson} disabled={existingRules.length === 0}>
					Export JSON
				</button>
				<button class="button secondary" type="button" onclick={exportExpressions} disabled={existingRules.length === 0}>
					Export .txt
				</button>
				<button class="button secondary" type="button" onclick={() => (showImportDialog = true)}>
					Import
				</button>
			</div>

			{#if existingRules.length === 0}
				<p class="muted">No WAF custom rules found for this zone.</p>
			{:else}
				<div style="overflow-x: auto;">
					<table>
						<thead>
							<tr>
								<th style="width: 4%;">#</th>
								<th style="width: 7%;">On</th>
								<th style="width: 20%;">Name</th>
								<th style="width: 33%;">Expression</th>
								<th style="width: 12%;">Action</th>
								<th style="width: 10%;">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each existingRules as rule, index}
								<tr
									style="cursor: pointer; {expandedRuleIndex === index ? 'background: oklch(0.18 0.02 230 / 0.3);' : ''}"
									onclick={() => toggleExpandRule(index)}
								>
									<td>{index + 1}</td>
									<td>
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<span onclick={(e) => e.stopPropagation()}>
											<button
												type="button"
												class="toggle-btn {rule.enabled !== false ? 'on' : 'off'}"
												onclick={() => { rule.enabled = rule.enabled !== false ? false : true; }}
												title={rule.enabled !== false ? 'Enabled — click to disable' : 'Disabled — click to enable'}
											>
												<span class="toggle-track"><span class="toggle-thumb"></span></span>
											</button>
										</span>
									</td>
									<td>{rule.description || '(unnamed)'}</td>
									<td class="mono" style="font-size: 0.68rem;" title={rule.expression}>{truncate(rule.expression || '', 60)}</td>
									<td><span class="action-badge {rule.action}">{actionLabel(rule.action)}</span></td>
									<td>
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<span onclick={(e) => e.stopPropagation()}>
											<button class="button danger" style="font-size: 0.68rem; padding: 0.18rem 0.45rem;" type="button" onclick={() => requestDeleteRule(index)}>
												Delete
											</button>
										</span>
									</td>
								</tr>

								{#if expandedRuleIndex === index}
									<tr>
										<td colspan="6" style="padding: 0;">
											<div class="panel stack" style="margin: 0.35rem 0;">
												<label class="stack">
													<span class="label">Rule Name / Description</span>
													<input class="input" bind:value={rule.description} />
												</label>

												<!-- Expression editor -->
												<div class="stack">
													<div class="row">
														<span class="label">Match expression</span>
														<button type="button" class="button {getMatchEditorView(index) === 'expression' ? '' : 'secondary'}" onclick={() => setMatchEditorView(index, 'expression')}>
															Expression View
														</button>
														<button type="button" class="button {getMatchEditorView(index) === 'simple' ? '' : 'secondary'}" onclick={() => setMatchEditorView(index, 'simple')}>
															Simple View
														</button>
													</div>

													{#if getMatchEditorView(index) === 'expression'}
														<div class="expression-editor mono">
															<pre class="expression-highlight" bind:this={expressionPreviews[index]}>{@html highlightExpression(rule.expression || '')}</pre>
															<textarea
																class="expression-input"
																bind:this={expressionInputs[index]}
																bind:value={rule.expression}
																onscroll={() => syncExpressionScroll(index)}
																oninput={() => { syncExpressionScroll(index); clearExistingExpressionValidationError(index); }}
																spellcheck="false"
															></textarea>
														</div>
													{:else}
														{#if simpleParseErrorsByRule[index]}
															<div class="status error">{simpleParseErrorsByRule[index]}</div>
															<div class="row">
																<button class="button secondary" type="button" onclick={() => resetSimpleExpression(index)}>
																	Start New Simple Expression
																</button>
															</div>
														{/if}

														{#if simpleConditionsByRule[index]}
															<div class="stack">
																{#each simpleConditionsByRule[index] as condition, conditionIndex}
																	<div class="panel stack">
																		{#if conditionIndex > 0}
																			<div class="row">
																				<span class="label">Join</span>
																				<button type="button" class="button {condition.joinWithPrevious === 'and' ? '' : 'secondary'}" onclick={() => onSimpleJoinChange(index, condition.id, 'and')}>AND</button>
																				<button type="button" class="button {condition.joinWithPrevious === 'or' ? '' : 'secondary'}" onclick={() => onSimpleJoinChange(index, condition.id, 'or')}>OR</button>
																			</div>
																		{/if}

																		<div class="grid-2">
																			<label class="stack">
																				<span class="label">Field</span>
																				<select class="select mono" bind:value={condition.field} onchange={() => onSimpleFieldChange(index, condition.id, condition.field)}>
																					{#each MATCH_FIELDS as field}
																						<option value={field.value}>{field.label}</option>
																					{/each}
																				</select>
																			</label>
																			<label class="stack">
																				<span class="label">Operator</span>
																				{#if isBooleanToggleField(condition.field)}
																					<input class="input mono" value="equals" disabled />
																				{:else}
																					<select class="select mono" bind:value={condition.operator} onchange={() => onSimpleOperatorChange(index, condition.id, condition.operator)}>
																						{#each MATCH_OPERATORS.filter((o) => isNumericField(condition.field) ? o.numericOnly : !o.numericOnly) as operator}
																							<option value={operator.value}>{operator.label}</option>
																						{/each}
																					</select>
																				{/if}
																			</label>
																		</div>

																		{#if isBooleanToggleField(condition.field)}
																			<div class="row">
																				<span class="label">Value</span>
																				<button type="button" class="button {condition.booleanToggleOn ? '' : 'secondary'}" onclick={() => { condition.booleanToggleOn = true; onSimpleBooleanToggleChange(index); }}>On</button>
																				<button type="button" class="button {condition.booleanToggleOn ? 'secondary' : ''}" onclick={() => { condition.booleanToggleOn = false; onSimpleBooleanToggleChange(index); }}>Off</button>
																			</div>
																		{:else if isListOperator(condition.operator)}
																			<label class="stack">
																				<span class="label">List</span>
																				{#if cfListsLoading}
																					<input class="input mono" value="Loading lists…" disabled />
																				{:else if cfLists.length === 0}
																					<input class="input mono" bind:value={condition.value} oninput={() => onSimpleValueChange(index)} placeholder="list_name (no lists found)" />
																				{:else}
																					<select class="select mono" bind:value={condition.value} onchange={() => onSimpleValueChange(index)}>
																						<option value="">Select a list…</option>
																						{#each cfLists as list}
																							<option value={list.name}>{list.name} ({list.kind}, {list.num_items} items)</option>
																						{/each}
																					</select>
																				{/if}
																			</label>
																		{:else}
																			<label class="stack">
																				<span class="label">Value</span>
																				<input class="input mono" bind:value={condition.value} oninput={() => onSimpleValueChange(index)} placeholder={simpleValuePlaceholder(condition.operator)} />
																			</label>
																		{/if}

																		<div class="row" style="justify-content: flex-end;">
																			<button class="button secondary" type="button" onclick={() => removeSimpleCondition(index, condition.id)}>Remove Row</button>
																		</div>
																	</div>
																{/each}
															</div>

															<div class="row">
																<button class="button secondary" type="button" onclick={() => addSimpleCondition(index, 'and')}>Add AND</button>
																<button class="button secondary" type="button" onclick={() => addSimpleCondition(index, 'or')}>Add OR</button>
															</div>
														{/if}
													{/if}
												</div>

												{#if existingExpressionValidationErrors[index]}
													<div class="status error">{existingExpressionValidationErrors[index]}</div>
												{/if}

												<!-- Action selector -->
												<div class="grid-2">
													<label class="stack">
														<span class="label">Action</span>
														<select class="select" bind:value={rule.action}>
															{#each WAF_ACTIONS as action}
																<option value={action.value}>{action.label}</option>
															{/each}
														</select>
													</label>
												</div>

												<!-- Block custom response (conditional) -->
												{#if rule.action === 'block'}
													<div class="panel stack">
														<span class="label">Block Response (optional)</span>
														<div class="grid-2">
															<label class="stack">
																<span class="label">Response type</span>
																<select class="select"
																	value={getRuleBlockResponseType(rule)}
																	onchange={(e) => onRuleBlockResponseTypeChange(rule, (e.currentTarget as HTMLSelectElement).value)}
																>
																	{#each BLOCK_RESPONSE_TYPES as rt}
																		<option value={rt.value}>{rt.label}</option>
																	{/each}
																</select>
															</label>
															<label class="stack">
																<span class="label">Status code (400–499)</span>
																<input class="input mono" type="number" min="400" max="499"
																	value={getRuleBlockStatusCode(rule)}
																	disabled={getRuleBlockResponseType(rule) === DEFAULT_BLOCK_RESPONSE_TYPE}
																	oninput={(e) => onRuleBlockStatusCodeInput(rule, (e.currentTarget as HTMLInputElement).value)}
																/>
															</label>
														</div>
														{#if getRuleBlockResponseType(rule) !== DEFAULT_BLOCK_RESPONSE_TYPE}
														<label class="stack">
															<span class="label">Response body</span>
															<textarea class="textarea mono"
																value={getRuleBlockBody(rule)}
																placeholder="Your request was blocked."
																oninput={(e) => onRuleBlockBodyInput(rule, (e.currentTarget as HTMLTextAreaElement).value)}
															></textarea>
														</label>
														{/if}
													</div>
												{/if}
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

	<!-- ─── CREATE TAB ──────────────────────────────────── -->
	{:else if activeTab === 'create'}
		<div class="stack">
			<label class="stack">
				<span class="label">Rule name / description</span>
				<input class="input" bind:value={createDescription} placeholder="My WAF rule" />
			</label>

			<!-- Expression editor for create -->
			<div class="stack">
				<div class="row">
					<span class="label">Match expression</span>
					<button type="button" class="button {getMatchEditorView(CREATE_EDITOR_INDEX) === 'expression' ? '' : 'secondary'}" onclick={() => setMatchEditorView(CREATE_EDITOR_INDEX, 'expression')}>
						Expression View
					</button>
					<button type="button" class="button {getMatchEditorView(CREATE_EDITOR_INDEX) === 'simple' ? '' : 'secondary'}" onclick={() => setMatchEditorView(CREATE_EDITOR_INDEX, 'simple')}>
						Simple View
					</button>
				</div>

				{#if getMatchEditorView(CREATE_EDITOR_INDEX) === 'expression'}
					<div class="expression-editor mono">
						<pre class="expression-highlight" bind:this={expressionPreviews[CREATE_EDITOR_INDEX]}>{@html highlightExpression(createExpressionText || '')}</pre>
						<textarea
							class="expression-input"
							bind:this={expressionInputs[CREATE_EDITOR_INDEX]}
							bind:value={createExpressionText}
							onscroll={() => syncExpressionScroll(CREATE_EDITOR_INDEX)}
							oninput={() => { syncExpressionScroll(CREATE_EDITOR_INDEX); createExpressionValidationError = ''; createRuleValidated = false; }}
							spellcheck="false"
							placeholder='(ip.src.country eq "GB") and (cf.waf.score lt 20)'
						></textarea>
					</div>
				{:else}
					{#if simpleParseErrorsByRule[CREATE_EDITOR_INDEX]}
						<div class="status error">{simpleParseErrorsByRule[CREATE_EDITOR_INDEX]}</div>
						<div class="row">
							<button class="button secondary" type="button" onclick={() => resetSimpleExpression(CREATE_EDITOR_INDEX)}>
								Start New Simple Expression
							</button>
						</div>
					{/if}

					{#if simpleConditionsByRule[CREATE_EDITOR_INDEX]}
						<div class="stack">
							{#each simpleConditionsByRule[CREATE_EDITOR_INDEX] as condition, conditionIndex}
								<div class="panel stack">
									{#if conditionIndex > 0}
										<div class="row">
											<span class="label">Join</span>
											<button type="button" class="button {condition.joinWithPrevious === 'and' ? '' : 'secondary'}" onclick={() => onSimpleJoinChange(CREATE_EDITOR_INDEX, condition.id, 'and')}>AND</button>
											<button type="button" class="button {condition.joinWithPrevious === 'or' ? '' : 'secondary'}" onclick={() => onSimpleJoinChange(CREATE_EDITOR_INDEX, condition.id, 'or')}>OR</button>
										</div>
									{/if}

									<div class="grid-2">
										<label class="stack">
											<span class="label">Field</span>
											<select class="select mono" bind:value={condition.field} onchange={() => onSimpleFieldChange(CREATE_EDITOR_INDEX, condition.id, condition.field)}>
												{#each MATCH_FIELDS as field}
													<option value={field.value}>{field.label}</option>
												{/each}
											</select>
										</label>
										<label class="stack">
											<span class="label">Operator</span>
											{#if isBooleanToggleField(condition.field)}
												<input class="input mono" value="equals" disabled />
											{:else}
												<select class="select mono" bind:value={condition.operator} onchange={() => onSimpleOperatorChange(CREATE_EDITOR_INDEX, condition.id, condition.operator)}>
													{#each MATCH_OPERATORS.filter((o) => isNumericField(condition.field) ? o.numericOnly : !o.numericOnly) as operator}
														<option value={operator.value}>{operator.label}</option>
													{/each}
												</select>
											{/if}
										</label>
									</div>

									{#if isBooleanToggleField(condition.field)}
										<div class="row">
											<span class="label">Value</span>
											<button type="button" class="button {condition.booleanToggleOn ? '' : 'secondary'}" onclick={() => { condition.booleanToggleOn = true; onSimpleBooleanToggleChange(CREATE_EDITOR_INDEX); }}>On</button>
											<button type="button" class="button {condition.booleanToggleOn ? 'secondary' : ''}" onclick={() => { condition.booleanToggleOn = false; onSimpleBooleanToggleChange(CREATE_EDITOR_INDEX); }}>Off</button>
										</div>
									{:else if isListOperator(condition.operator)}
										<label class="stack">
											<span class="label">List</span>
											{#if cfListsLoading}
												<input class="input mono" value="Loading lists…" disabled />
											{:else if cfLists.length === 0}
												<input class="input mono" bind:value={condition.value} oninput={() => onSimpleValueChange(CREATE_EDITOR_INDEX)} placeholder="list_name (no lists found)" />
											{:else}
												<select class="select mono" bind:value={condition.value} onchange={() => onSimpleValueChange(CREATE_EDITOR_INDEX)}>
													<option value="">Select a list…</option>
													{#each cfLists as list}
														<option value={list.name}>{list.name} ({list.kind}, {list.num_items} items)</option>
													{/each}
												</select>
											{/if}
										</label>
									{:else}
										<label class="stack">
											<span class="label">Value</span>
											<input class="input mono" bind:value={condition.value} oninput={() => onSimpleValueChange(CREATE_EDITOR_INDEX)} placeholder={simpleValuePlaceholder(condition.operator)} />
										</label>
									{/if}

									<div class="row" style="justify-content: flex-end;">
										<button class="button secondary" type="button" onclick={() => removeSimpleCondition(CREATE_EDITOR_INDEX, condition.id)}>Remove Row</button>
									</div>
								</div>
							{/each}
						</div>

						<div class="row">
							<button class="button secondary" type="button" onclick={() => addSimpleCondition(CREATE_EDITOR_INDEX, 'and')}>Add AND</button>
							<button class="button secondary" type="button" onclick={() => addSimpleCondition(CREATE_EDITOR_INDEX, 'or')}>Add OR</button>
						</div>
					{/if}
				{/if}
			</div>

			{#if createExpressionValidationError}
				<div class="status error">{createExpressionValidationError}</div>
			{/if}

			<div class="grid-2">
				<label class="stack">
					<span class="label">Action</span>
					<select class="select" bind:value={createAction}>
						{#each WAF_ACTIONS as action}
							<option value={action.value}>{action.label}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if createAction === 'block'}
				<div class="panel stack">
					<span class="label">Block Response (optional)</span>
					<div class="grid-2">
						<label class="stack">
							<span class="label">Response type</span>
							<select class="select" bind:value={createBlockResponseType}>
								{#each BLOCK_RESPONSE_TYPES as rt}
									<option value={rt.value}>{rt.label}</option>
								{/each}
							</select>
						</label>
						<label class="stack">
							<span class="label">Status code (400–499)</span>
							<input class="input mono" type="number" min="400" max="499" bind:value={createBlockStatusCode} disabled={createBlockResponseType === DEFAULT_BLOCK_RESPONSE_TYPE} />
						</label>
					</div>
				{#if createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE}
				<label class="stack">
					<span class="label">Response body</span>
					<textarea class="textarea mono" bind:value={createBlockBody} placeholder="Your request was blocked."></textarea>
				</label>
				{/if}
			{/if}

			<div class="row">
				<button class="button secondary" type="button" onclick={validateCreateRule} disabled={busy}>Validate Rule</button>
			</div>

			{#if createRuleValidated}
				<div class="status ok">Rule is valid — choose how to deploy it.</div>
				<div class="row">
					<button class="button" type="button" onclick={deployAppend} disabled={busy || !selectedZoneId}>
						Deploy (Append to Existing)
					</button>
					<button class="button danger" type="button" onclick={deployReplace} disabled={busy || !selectedZoneId}>
						Deploy (Replace Ruleset)
					</button>
				</div>
			{/if}
		</div>

	<!-- ─── COPY TAB ────────────────────────────────────── -->
	{:else if activeTab === 'copy'}
		<div class="stack">
			<p class="muted">Copy selected rules from the current zone to another zone. Rules are appended to the target zone's existing rules.</p>

			{#if existingRules.length === 0}
				<p class="muted">Load rules in the Manage tab first.</p>
			{:else}
				<div class="row">
					<button class="button secondary" type="button" onclick={selectAllForCopy}>Select All</button>
					<button class="button secondary" type="button" onclick={deselectAllForCopy}>Deselect All</button>
					<span class="label">{copySelection.size} of {existingRules.length} selected</span>
				</div>

				<div style="overflow-x: auto;">
					<table>
						<thead>
							<tr>
								<th style="width: 5%;"></th>
								<th style="width: 5%;">#</th>
								<th style="width: 30%;">Name</th>
								<th style="width: 40%;">Expression</th>
								<th style="width: 15%;">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each existingRules as rule, index}
								<tr style="cursor: pointer;" onclick={() => toggleCopySelection(index)}>
									<td><input type="checkbox" checked={copySelection.has(index)} /></td>
									<td>{index + 1}</td>
									<td>{rule.description || '(unnamed)'}</td>
									<td class="mono" style="font-size: 0.68rem;">{truncate(rule.expression || '', 50)}</td>
									<td><span class="action-badge {rule.action}">{actionLabel(rule.action)}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="stack" style="gap: 0.3rem;">
					<label class="muted" for="copy-target-filter">Target zone filter</label>
					<input id="copy-target-filter" class="input" type="text" placeholder="Filter zones…" bind:value={copyTargetQuery} />
				</div>
				<div class="stack" style="gap: 0.3rem;">
					<div class="row">
						<span class="label">Target zones ({copyTargetZoneIds.size} selected)</span>
						<button class="button secondary" style="font-size: 0.68rem; padding: 0.18rem 0.45rem;" type="button" onclick={selectAllCopyTargets}>All</button>
						<button class="button secondary" style="font-size: 0.68rem; padding: 0.18rem 0.45rem;" type="button" onclick={deselectAllCopyTargets}>None</button>
					</div>
					<div class="copy-target-list">
						{#each filteredCopyTargetZones.filter((z) => z.id !== selectedZoneId) as zone (zone.id)}
							<label class="copy-target-item">
								<input type="checkbox" checked={copyTargetZoneIds.has(zone.id)} onchange={() => toggleCopyTargetZone(zone.id)} />
								<span>{zone.name}</span>
							</label>
						{/each}
						{#if filteredCopyTargetZones.filter((z) => z.id !== selectedZoneId).length === 0}
							<span class="label">No matching zones</span>
						{/if}
					</div>
				</div>

				<div class="row">
					<button class="button" type="button" onclick={executeCopy} disabled={busy || copyTargetZoneIds.size === 0 || copySelection.size === 0}>
						Copy {copySelection.size} Rule(s) to {copyTargetZoneIds.size} Zone(s)
					</button>
				</div>
			{/if}
		</div>
	{/if}
</section>

<!-- ─── Toast ───────────────────────────────────────────── -->
{#if toast}
	<div class="status toast {toast.type === 'ok' ? 'ok' : 'error'}">{toast.message}</div>
{/if}

<!-- ─── Delete Confirm Dialog ───────────────────────────── -->
{#if deleteConfirmIndex !== null}
	<div class="dialog-backdrop">
		<div class="dialog panel stack">
			<strong>Delete Rule {deleteConfirmIndex + 1}?</strong>
			<p class="muted">This removes it from the current list. Use Save Changes to make deletion live.</p>
			<div class="row" style="justify-content: flex-end;">
				<button class="button secondary" type="button" onclick={() => (deleteConfirmIndex = null)}>Cancel</button>
				<button class="button danger" type="button" onclick={confirmDeleteRule}>Confirm Delete</button>
			</div>
		</div>
	</div>
{/if}

<!-- ─── Import Dialog ───────────────────────────────────── -->
{#if showImportDialog}
	<div class="dialog-backdrop">
		<div class="dialog panel stack">
			<strong>Import Rules</strong>
			<div class="row">
				<button type="button" class="button {importMode === 'json' ? '' : 'secondary'}" onclick={() => (importMode = 'json')}>JSON</button>
				<button type="button" class="button {importMode === 'text' ? '' : 'secondary'}" onclick={() => (importMode = 'text')}>Text (expressions)</button>
			</div>

			{#if importMode === 'text'}
				<div class="grid-2">
					<label class="stack">
						<span class="label">Default action for imported rules</span>
						<select class="select" bind:value={importDefaultAction}>
							{#each WAF_ACTIONS as action}
								<option value={action.value}>{action.label}</option>
							{/each}
						</select>
					</label>
				</div>
				<p class="muted">Format: one rule per line. Use <code>name | expression | action</code> or just the expression.</p>
			{:else}
				<p class="muted">Paste a RAMPART JSON export or an array of rule objects.</p>
			{/if}

			<label class="stack">
				<span class="label">Upload file</span>
				<input type="file" accept=".json,.txt,.text" onchange={onImportFileUpload} />
			</label>

			<label class="stack">
				<span class="label">Or paste content</span>
				<textarea class="textarea mono" bind:value={importText} placeholder="Paste here…"></textarea>
			</label>

			<div class="row" style="justify-content: flex-end;">
				<button class="button secondary" type="button" onclick={() => { showImportDialog = false; importText = ''; }}>Cancel</button>
				<button class="button" type="button" onclick={handleImport} disabled={!importText.trim()}>Import into Preview</button>
			</div>
		</div>
	</div>
{/if}
