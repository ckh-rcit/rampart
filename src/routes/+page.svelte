<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		WafRule,
		WafAction,
		ZoneSummary,
		CfList,
		RampartExportPayload,
		MatchFieldOptionValue,
		MatchOperatorOptionValue,
		MatchJoin,
		MatchEditorView,
		SimpleMatchCondition
	} from '$lib/types';
	import {
		WAF_ACTIONS,
		BLOCK_RESPONSE_TYPES,
		DEFAULT_BLOCK_RESPONSE_TYPE,
		CUSTOM_BLOCK_RESPONSE_CONTENT_TYPES,
		MATCH_FIELDS,
		MATCH_OPERATORS,
		DEFAULT_TEXT_OPERATORS,
		DEFAULT_NUMERIC_OPERATORS,
		FIELD_OPERATOR_OVERRIDES,
		CONTINENT_VALUE_OPTIONS,
		COUNTRY_VALUE_OPTIONS,
		REQUEST_METHOD_VALUE_OPTIONS,
		HTTP_VERSION_VALUE_OPTIONS,
		type CustomBlockResponseContentType,
		type BlockResponseTypeValue
	} from '$lib/constants';
	import {
		escapeHtml,
		escapeExpressionValue,
		unescapeExpressionValue,
		truncate,
		actionLabel,
		highlightExpression
	} from '$lib/utils';
	import BulkOperations from '$lib/components/BulkOperations.svelte';

	type Tab = 'manage' | 'create' | 'bulk';

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

	interface FieldValueOption {
		value: string;
		label: string;
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
	let simpleValidationErrorsByRule = $state<Record<number, string>>({});
	let tagInputByCondition = $state<Record<number, string>>({});
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
	let existingRuleValidated = $state<Record<number, boolean>>({});

	// Bulk operations (state managed in BulkOperations component)

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

	function isIpSourceField(field: MatchFieldOptionValue): boolean {
		return field === 'ip.src';
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

	function clearExistingRuleValidated(index: number): void {
		if (!existingRuleValidated[index]) return;
		const next = { ...existingRuleValidated };
		delete next[index];
		existingRuleValidated = next;
	}

	function markExistingRuleValidated(index: number): void {
		existingRuleValidated = {
			...existingRuleValidated,
			[index]: true
		};
	}

	function isExistingRuleValidated(index: number): boolean {
		return existingRuleValidated[index] === true;
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
				const rawError = data.error || 'Expression is invalid.';
				if (
					rawError.includes('expected IP address character') &&
					/\bip\.src\s+(eq|ne)\s+"/i.test(trimmed)
				) {
					return `${rawError} Tip: use unquoted IP/CIDR values for ip.src (example: ip.src ne 158.61.0.0/16).`;
				}
				return rawError;
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

	async function validateExistingRule(index: number): Promise<void> {
		const rule = existingRules[index];
		if (!rule) return;

		try {
			if (!rule.expression?.trim()) throw new Error('Expression is required.');

			const expressionError = await validateExpressionWithApi(rule.expression);
			if (expressionError) {
				existingExpressionValidationErrors = {
					...existingExpressionValidationErrors,
					[index]: expressionError
				};
				throw new Error('Expression is invalid.');
			}

			clearExistingExpressionValidationError(index);

			if (
				rule.action === 'block' &&
				getRuleBlockResponseType(rule) !== DEFAULT_BLOCK_RESPONSE_TYPE &&
				!getRuleBlockBody(rule).trim()
			) {
				throw new Error('Response body is required when using a custom block response.');
			}

			markExistingRuleValidated(index);
			showToast('ok', 'Rule is valid — ready to save.');
		} catch (error) {
			clearExistingRuleValidated(index);
			showToast('error', error instanceof Error ? error.message : 'Validation failed');
		}
	}

	function toggleExpandRule(index: number): void {
		expandedRuleIndex = expandedRuleIndex === index ? null : index;
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

	function isTagInputField(field: MatchFieldOptionValue, operator: MatchOperatorOptionValue): boolean {
		return field === 'ip.src' && isSetOperator(operator);
	}

	function getTagsFromCondition(condition: SimpleMatchCondition): string[] {
		return (condition.value ?? '').split(/\s+/).filter(Boolean);
	}

	function addTagToCondition(condition: SimpleMatchCondition, editorIndex: number, raw: string): void {
		const newTokens = raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
		if (newTokens.length === 0) return;
		const existing = getTagsFromCondition(condition);
		const seen = new Set(existing);
		for (const t of newTokens) {
			if (!seen.has(t)) { existing.push(t); seen.add(t); }
		}
		condition.value = existing.join(' ');
		tagInputByCondition[condition.id] = '';
		onSimpleValueChange(editorIndex);
	}

	function removeTagFromCondition(condition: SimpleMatchCondition, editorIndex: number, tag: string): void {
		condition.value = getTagsFromCondition(condition).filter((t) => t !== tag).join(' ');
		onSimpleValueChange(editorIndex);
	}

	function onTagInputKeydown(e: KeyboardEvent, condition: SimpleMatchCondition, editorIndex: number): void {
		const input = tagInputByCondition[condition.id] ?? '';
		if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab' || e.key === ' ') && input.trim()) {
			e.preventDefault();
			addTagToCondition(condition, editorIndex, input);
		} else if (e.key === 'Backspace' && !input) {
			const tags = getTagsFromCondition(condition);
			if (tags.length > 0) removeTagFromCondition(condition, editorIndex, tags[tags.length - 1]);
		}
	}

	function getAllowedOperatorValuesForField(field: MatchFieldOptionValue): MatchOperatorOptionValue[] {
		if (isBooleanToggleField(field)) return [];
		const overridden = FIELD_OPERATOR_OVERRIDES[field];
		if (overridden && overridden.length > 0) return overridden;
		if (isNumericField(field)) return DEFAULT_NUMERIC_OPERATORS;
		return DEFAULT_TEXT_OPERATORS;
	}

	function getMatchOperatorsForField(field: MatchFieldOptionValue): MatchOperatorOption[] {
		const allowed = new Set(getAllowedOperatorValuesForField(field));
		return MATCH_OPERATORS.filter((operator) => allowed.has(operator.value));
	}

	function isOperatorAllowedForField(field: MatchFieldOptionValue, operator: MatchOperatorOptionValue): boolean {
		return getAllowedOperatorValuesForField(field).includes(operator);
	}

	function getFieldValueOptions(field: MatchFieldOptionValue, operator: MatchOperatorOptionValue): FieldValueOption[] {
		if (isBooleanToggleField(field) || isSetOperator(operator) || isListOperator(operator)) return [];

		switch (field) {
			case 'ip.src.country':
				return COUNTRY_VALUE_OPTIONS;
			case 'ip.src.continent':
				return CONTINENT_VALUE_OPTIONS;
			case 'http.request.method':
				return REQUEST_METHOD_VALUE_OPTIONS;
			case 'http.request.version':
				return HTTP_VERSION_VALUE_OPTIONS;
			default:
				return [];
		}
	}

	function simpleValuePlaceholder(op: MatchOperatorOptionValue): string {
		if (isSetOperator(op)) return '203.0.113.0/24 198.51.100.0/24';
		return '';
	}

	function nextSimpleConditionId(): number {
		simpleConditionSeed += 1;
		return simpleConditionSeed;
	}

	function isCidrValue(value: string): boolean {
		const trimmed = value.trim();
		if (!trimmed.includes('/')) return false;
		const match = trimmed.match(/^([A-Fa-f0-9:.]+)\/(\d{1,3})$/);
		if (!match) return false;
		const prefix = Number(match[2]);
		if (match[1].includes(':')) return prefix >= 0 && prefix <= 128;
		return prefix >= 0 && prefix <= 32;
	}

	function getSimpleConditionCompatibilityError(condition: SimpleMatchCondition): string | null {
		const value = (condition.value ?? '').trim();
		if (isBooleanToggleField(condition.field)) return null;

		// CIDR with eq/ne on ip.src — should use in_set
		if (
			condition.field === 'ip.src' &&
			(condition.operator === 'equals' || condition.operator === 'not_equals') &&
			value && isCidrValue(value)
		) {
			return "CIDR ranges can only be used with 'in' operators. Use in set / not in set for ip.src CIDR ranges.";
		}

		// Empty set — must have at least one value
		if (isSetOperator(condition.operator) && !value) {
			return 'Add at least one value to the set.';
		}

		// AS number must be numeric
		if (condition.field === 'ip.src.asnum') {
			if ((condition.operator === 'equals' || condition.operator === 'not_equals') && value && !/^\d+$/.test(value)) {
				return 'AS numbers must be numeric (e.g. 13335 for Cloudflare).';
			}
			if (isSetOperator(condition.operator) && value) {
				const invalid = value.split(/\s+/).filter(Boolean).find((t) => !/^\d+$/.test(t));
				if (invalid) return `"${invalid}" is not a valid AS number — AS numbers must be numeric digits only.`;
			}
		}

		// List name format
		if (isListOperator(condition.operator) && value && !/^[A-Za-z0-9_-]+$/.test(value)) {
			return 'List name can only contain letters, numbers, underscores, and hyphens.';
		}

		return null;
	}

	function updateSimpleValidationError(index: number): void {
		const conditions = simpleConditionsByRule[index] ?? [];
		for (const condition of conditions) {
			const message = getSimpleConditionCompatibilityError(condition);
			if (message) {
				simpleValidationErrorsByRule[index] = message;
				return;
			}
		}

		if (!simpleValidationErrorsByRule[index]) return;
		const next = { ...simpleValidationErrorsByRule };
		delete next[index];
		simpleValidationErrorsByRule = next;
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
		const rawValue = (condition.value ?? '').trim();

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
				if (isIpSourceField(field)) return `(${field} eq ${rawValue})`;
				return `(${field} eq "${escaped}")`;
			case 'not_equals':
				if (isIpSourceField(field)) return `(${field} ne ${rawValue})`;
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
		clearExistingRuleValidated(index);
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

		updateSimpleValidationError(index);
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

		const ipDirect = trimmed.match(/^\((ip\.src)\s+(eq|ne)\s+([A-Fa-f0-9:.]+(?:\/\d{1,3})?)\)$/);
		if (ipDirect) {
			return {
				field: ipDirect[1] as MatchFieldOptionValue,
				operator: ipDirect[2] === 'eq' ? 'equals' : 'not_equals',
				value: ipDirect[3],
				booleanToggleOn: true
			};
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
		const expression = (getExpressionForEditor(index) || '').trim();
		if (!expression) {
			simpleParseErrorsByRule[index] = '';
			simpleConditionsByRule[index] = [defaultSimpleCondition()];
			updateSimpleValidationError(index);
			return;
		}

		const parsed = parseExpressionToSimpleConditions(expression);
		if (!parsed) {
			simpleParseErrorsByRule[index] =
				'This expression cannot be represented in Simple View. Switch to Expression View to edit it directly.';
			simpleConditionsByRule[index] = [defaultSimpleCondition()];
			updateSimpleValidationError(index);
			return;
		}
		simpleParseErrorsByRule[index] = '';
		simpleConditionsByRule[index] = parsed;
		updateSimpleValidationError(index);
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
				continue;
			}

			const allowed = getAllowedOperatorValuesForField(field);
			if (!allowed.includes(c.operator)) {
				c.operator = allowed[0] ?? 'equals';
			}
		}
		rebuildRuleExpressionFromSimple(index);
	}

	function onSimpleOperatorChange(index: number, conditionId: number, operator: MatchOperatorOptionValue): void {
		const current = simpleConditionsByRule[index] ?? [];
		for (const c of current) {
			if (c.id !== conditionId) continue;
			if (!isOperatorAllowedForField(c.field, operator)) continue;
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
			existingRuleValidated = {};
			expandedRuleIndex = null;
			showToast('ok', `Loaded ${existingRules.length} existing rule(s).`);
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Failed to load rules');
		} finally {
			busy = false;
		}
	}

	async function saveRulesRaw(): Promise<void> {
		if (!selectedZoneId) return;
		busy = true;
		try {
			const sanitizedRules = sanitizeRulesForSubmission(existingRules);
			const response = await fetch(`/api/zones/${selectedZoneId}/rules`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: existingRulesetName, rules: sanitizedRules })
			});
			const data = (await response.json()) as RulesResponse;
			if (!response.ok) throw new Error(data.error || 'Save failed');
			existingRules = data.rules || [];
		} catch (error) {
			showToast('error', error instanceof Error ? error.message : 'Save failed');
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
			existingRuleValidated = {};
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
		saveRulesRaw();
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
		<button type="button" class="button {activeTab === 'bulk' ? '' : 'secondary'}" onclick={() => (activeTab = 'bulk')}>
			Bulk Operations
		</button>
	</div>

	<!-- ─── MANAGE TAB ──────────────────────────────────── -->
	{#if activeTab === 'manage'}
		<div class="stack">
			<div class="row">
				<button class="button secondary" type="button" onclick={loadExistingRules} disabled={busy || !selectedZoneId}>
					Refresh
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
								<th style="width: 3%;"></th>
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
									class="rule-row {expandedRuleIndex === index ? 'expanded' : ''}"
									onclick={() => toggleExpandRule(index)}
									title="Click to edit rule"
								>
									<td style="text-align: center; color: var(--muted); font-size: 0.65rem;">{expandedRuleIndex === index ? '▲' : '▶'}</td>
									<td>{index + 1}</td>
									<td>
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<span onclick={(e) => e.stopPropagation()}>
											<button
												type="button"
												class="toggle-btn {rule.enabled !== false ? 'on' : 'off'}"
												onclick={() => { rule.enabled = rule.enabled !== false ? false : true; saveRulesRaw(); }}
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
										<td colspan="7" style="padding: 0;">
											<div class="panel stack" style="margin: 0.35rem 0; border-left: 2px solid var(--accent);">
												<label class="stack">
													<span class="label">Rule Name / Description</span>
													<input class="input" bind:value={rule.description} oninput={() => clearExistingRuleValidated(index)} />
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
																oninput={() => { syncExpressionScroll(index); clearExistingExpressionValidationError(index); clearExistingRuleValidated(index); }}
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
														{#if simpleValidationErrorsByRule[index]}
															<div class="status error">{simpleValidationErrorsByRule[index]}</div>
														{/if}

														{#if simpleConditionsByRule[index]}
															<div class="stack">
																{#each simpleConditionsByRule[index] as condition, conditionIndex}
										{#if conditionIndex > 0}
											<div class="join-connector">
												<div class="join-line"></div>
												<button type="button" class="join-pill {condition.joinWithPrevious === 'and' ? 'active-and' : ''}" onclick={() => onSimpleJoinChange(index, condition.id, 'and')}>AND</button>
												<button type="button" class="join-pill {condition.joinWithPrevious === 'or' ? 'active-or' : ''}" onclick={() => onSimpleJoinChange(index, condition.id, 'or')}>OR</button>
												<div class="join-line"></div>
											</div>
										{/if}
										<div class="panel stack">
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
																						{#each getMatchOperatorsForField(condition.field) as operator}
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
																		{:else if getFieldValueOptions(condition.field, condition.operator).length > 0}
																			<label class="stack">
																				<span class="label">Value</span>
																				<select class="select mono" bind:value={condition.value} onchange={() => onSimpleValueChange(index)}>
																					<option value="">Select a value…</option>
																					{#each getFieldValueOptions(condition.field, condition.operator) as option}
																						<option value={option.value}>{option.label}</option>
																					{/each}
																				</select>
																			</label>
																		{:else if isTagInputField(condition.field, condition.operator)}
																			<label class="stack">
																				<span class="label">Value</span>
																				<div class="tag-input-container">
																					{#each getTagsFromCondition(condition) as tag}
																						<span class="tag-chip">
																							<span class="tag-chip-text">{tag}</span>
																							<button type="button" class="tag-chip-remove" onclick={() => removeTagFromCondition(condition, index, tag)} aria-label="Remove {tag}">×</button>
																						</span>
																					{/each}
																					<input
																						class="tag-input-field mono"
																						type="text"
																						value={tagInputByCondition[condition.id] ?? ''}
																						oninput={(e) => { tagInputByCondition[condition.id] = (e.target as HTMLInputElement).value; }}
																						onkeydown={(e) => onTagInputKeydown(e, condition, index)}
																						onblur={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) { addTagToCondition(condition, index, v); (e.target as HTMLInputElement).value = ''; } }}
																						placeholder={getTagsFromCondition(condition).length === 0 ? 'e.g. 192.0.2.0 or 203.0.113.0/24' : ''}
																					/>
																				</div>
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
																<button class="button secondary" type="button" onclick={() => addSimpleCondition(index, 'and')}>+ AND condition</button>
																<button class="button secondary" type="button" onclick={() => addSimpleCondition(index, 'or')}>+ OR condition</button>
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
														<select class="select" bind:value={rule.action} onchange={() => clearExistingRuleValidated(index)}>
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
																	onchange={(e) => { onRuleBlockResponseTypeChange(rule, (e.currentTarget as HTMLSelectElement).value); clearExistingRuleValidated(index); }}
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
																	oninput={(e) => { onRuleBlockStatusCodeInput(rule, (e.currentTarget as HTMLInputElement).value); clearExistingRuleValidated(index); }}
																/>
															</label>
														</div>
														{#if getRuleBlockResponseType(rule) !== DEFAULT_BLOCK_RESPONSE_TYPE}
														<label class="stack">
															<span class="label">Response body</span>
															<textarea class="textarea mono"
																value={getRuleBlockBody(rule)}
																placeholder="Your request was blocked."
																oninput={(e) => { onRuleBlockBodyInput(rule, (e.currentTarget as HTMLTextAreaElement).value); clearExistingRuleValidated(index); }}
															></textarea>
														</label>
														{/if}
													</div>
												{/if}

												{#if isExistingRuleValidated(index)}
													<div class="status ok">Rule is valid — ready to save.</div>
												{/if}

												<div class="row" style="justify-content: flex-end;">
													<button class="button secondary" type="button" onclick={() => validateExistingRule(index)} disabled={busy}>
														Validate Rule
													</button>
													<button class="button save" type="button" onclick={saveExistingRules} disabled={busy || !selectedZoneId || !isExistingRuleValidated(index)}>
														Save Rule
													</button>
												</div>
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
					{#if simpleValidationErrorsByRule[CREATE_EDITOR_INDEX]}
						<div class="status error">{simpleValidationErrorsByRule[CREATE_EDITOR_INDEX]}</div>
					{/if}

					{#if simpleConditionsByRule[CREATE_EDITOR_INDEX]}
						<div class="stack">
							{#each simpleConditionsByRule[CREATE_EDITOR_INDEX] as condition, conditionIndex}
								{#if conditionIndex > 0}
									<div class="join-connector">
										<div class="join-line"></div>
										<button type="button" class="join-pill {condition.joinWithPrevious === 'and' ? 'active-and' : ''}" onclick={() => onSimpleJoinChange(CREATE_EDITOR_INDEX, condition.id, 'and')}>AND</button>
										<button type="button" class="join-pill {condition.joinWithPrevious === 'or' ? 'active-or' : ''}" onclick={() => onSimpleJoinChange(CREATE_EDITOR_INDEX, condition.id, 'or')}>OR</button>
										<div class="join-line"></div>
									</div>
								{/if}
								<div class="panel stack">

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
													{#each getMatchOperatorsForField(condition.field) as operator}
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
										{:else if getFieldValueOptions(condition.field, condition.operator).length > 0}
											<label class="stack">
												<span class="label">Value</span>
												<select class="select mono" bind:value={condition.value} onchange={() => onSimpleValueChange(CREATE_EDITOR_INDEX)}>
													<option value="">Select a value…</option>
													{#each getFieldValueOptions(condition.field, condition.operator) as option}
														<option value={option.value}>{option.label}</option>
													{/each}
												</select>
											</label>
									{:else if isTagInputField(condition.field, condition.operator)}
										<label class="stack">
											<span class="label">Value</span>
											<div class="tag-input-container">
												{#each getTagsFromCondition(condition) as tag}
													<span class="tag-chip">
														<span class="tag-chip-text">{tag}</span>
														<button type="button" class="tag-chip-remove" onclick={() => removeTagFromCondition(condition, CREATE_EDITOR_INDEX, tag)} aria-label="Remove {tag}">×</button>
													</span>
												{/each}
												<input
													class="tag-input-field mono"
													type="text"
													value={tagInputByCondition[condition.id] ?? ''}
													oninput={(e) => { tagInputByCondition[condition.id] = (e.target as HTMLInputElement).value; }}
													onkeydown={(e) => onTagInputKeydown(e, condition, CREATE_EDITOR_INDEX)}
													onblur={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) { addTagToCondition(condition, CREATE_EDITOR_INDEX, v); (e.target as HTMLInputElement).value = ''; } }}
													placeholder={getTagsFromCondition(condition).length === 0 ? 'e.g. 192.0.2.0 or 203.0.113.0/24' : ''}
												/>
											</div>
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
							<button class="button secondary" type="button" onclick={() => addSimpleCondition(CREATE_EDITOR_INDEX, 'and')}>+ AND condition</button>
							<button class="button secondary" type="button" onclick={() => addSimpleCondition(CREATE_EDITOR_INDEX, 'or')}>+ OR condition</button>
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
				</div>
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

	<!-- ─── BULK OPERATIONS TAB ──────────────────────────── -->
	{:else if activeTab === 'bulk'}
		<BulkOperations
			{zones}
			{selectedZoneId}
			sourceRules={existingRules}
			sourceRulesetName={existingRulesetName}
			{cfLists}
			{cfListsLoading}
			onshowtoast={showToast}
		/>
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
