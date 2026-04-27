<script lang="ts">
	import type {
		WafRule,
		WafAction,
		ZoneSummary,
		CfList,
		MatchFieldOptionValue,
		MatchOperatorOptionValue,
		MatchJoin,
		MatchEditorView,
		MatchOperatorOption,
		FieldValueOption,
		SimpleMatchCondition
	} from '$lib/types';
	import {
		WAF_ACTIONS,
		BLOCK_RESPONSE_TYPES,
		DEFAULT_BLOCK_RESPONSE_TYPE,
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
		truncate,
		actionLabel,
		highlightExpression,
		escapeExpressionValue,
		unescapeExpressionValue
	} from '$lib/utils';

	type BulkTab = 'copy' | 'remove' | 'create';
	type BulkStatus = 'pending' | 'running' | 'ok' | 'error';

	interface RulesPayload {
		rules?: WafRule[];
		name?: string;
		error?: string;
	}

	let {
		zones,
		selectedZoneId,
		sourceRules,
		sourceRulesetName = 'Custom rules',
		cfLists = [],
		cfListsLoading = false,
		onshowtoast
	}: {
		zones: ZoneSummary[];
		selectedZoneId: string;
		sourceRules: WafRule[];
		sourceRulesetName?: string;
		cfLists?: CfList[];
		cfListsLoading?: boolean;
		onshowtoast: (type: 'ok' | 'error', message: string) => void;
	} = $props();

	let bulkTab = $state<BulkTab>('copy');
	let busy = $state(false);

	// ── Zone filtering ──────────────────────────────────────

	function filterZones(query: string, excludeSelected = false): ZoneSummary[] {
		const q = query.trim().toLowerCase();
		let result = q ? zones.filter((z) => z.name.toLowerCase().includes(q)) : zones;
		if (excludeSelected) result = result.filter((z) => z.id !== selectedZoneId);
		return result;
	}

	// ── Shared zone-list helper ─────────────────────────────

	function progressCounts(progress: Record<string, BulkStatus>) {
		const ok = Object.values(progress).filter((s) => s === 'ok').length;
		const err = Object.values(progress).filter((s) => s === 'error').length;
		const done = ok + err;
		const total = Object.keys(progress).length;
		return { ok, err, done, total };
	}

	// ══════════════════════════════════════════════════════════
	// COPY RULES
	// ══════════════════════════════════════════════════════════

	let copyTargetZoneIds = $state<Set<string>>(new Set());
	let copySelection = $state<Set<number>>(new Set());
	let copyTargetQuery = $state('');
	let copyProgress = $state<Record<string, BulkStatus>>({});

	const filteredCopyTargetZones = $derived(filterZones(copyTargetQuery, true));

	function toggleCopySelection(index: number): void {
		const next = new Set(copySelection);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		copySelection = next;
		copyProgress = {};
	}

	function selectAllForCopy(): void {
		copySelection = new Set(sourceRules.map((_, i) => i));
		copyProgress = {};
	}

	function deselectAllForCopy(): void {
		copySelection = new Set();
		copyProgress = {};
	}

	function toggleCopyTarget(zoneId: string): void {
		const next = new Set(copyTargetZoneIds);
		if (next.has(zoneId)) next.delete(zoneId);
		else next.add(zoneId);
		copyTargetZoneIds = next;
		copyProgress = {};
	}

	function selectAllCopyTargets(): void {
		copyTargetZoneIds = new Set(filteredCopyTargetZones.map((z) => z.id));
		copyProgress = {};
	}

	function deselectAllCopyTargets(): void {
		copyTargetZoneIds = new Set();
		copyProgress = {};
	}

	async function executeCopy(): Promise<void> {
		if (copyTargetZoneIds.size === 0 || copySelection.size === 0) return;
		busy = true;

		const rulesToCopy = sourceRules
			.filter((_, i) => copySelection.has(i))
			.map((rule) => {
				const { id: _id, ref: _ref, ...rest } = rule;
				return rest as WafRule;
			});

		const init: Record<string, BulkStatus> = {};
		for (const id of copyTargetZoneIds) init[id] = 'pending';
		copyProgress = init;

		for (const targetId of copyTargetZoneIds) {
			copyProgress = { ...copyProgress, [targetId]: 'running' };
			try {
				const loadRes = await fetch(`/api/zones/${targetId}/rules`);
				const loadData = (await loadRes.json()) as RulesPayload;
				if (!loadRes.ok) throw new Error(loadData.error || 'Failed to load target zone rules');

				const merged = [...(loadData.rules ?? []), ...rulesToCopy];
				const saveRes = await fetch(`/api/zones/${targetId}/rules`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: loadData.name ?? 'Custom rules', rules: merged })
				});
				const saveData = (await saveRes.json()) as RulesPayload;
				if (!saveRes.ok) throw new Error(saveData.error || 'Copy failed');

				copyProgress = { ...copyProgress, [targetId]: 'ok' };
			} catch {
				copyProgress = { ...copyProgress, [targetId]: 'error' };
			}
		}

		const { ok, err } = progressCounts(copyProgress);
		if (ok > 0 && err === 0) onshowtoast('ok', `Copied ${rulesToCopy.length} rule(s) to ${ok} zone(s).`);
		else if (err > 0) onshowtoast('error', `${ok} zone(s) succeeded, ${err} failed — see details below.`);

		busy = false;
	}

	// ══════════════════════════════════════════════════════════
	// REMOVE BY NAME
	// ══════════════════════════════════════════════════════════

	let removeNameQuery = $state('');
	let removePreview = $state<Record<string, { zoneName: string; rules: WafRule[] }>>({});
	let removePreviewLoading = $state(false);
	let removeConfirmOpen = $state(false);
	let removeAcknowledged = $state(false);
	let removeProgress = $state<Record<string, BulkStatus>>({});
	let removeSearchProgress = $state<Record<string, BulkStatus>>({});
	let removeSearchCurrentZone = $state('');
	let removeSearchCompleted = $state(0);
	let removeSearchTotal = $state(0);
	let removeExpandedExpressions = $state<Record<string, boolean>>({});

	const removePreviewZones = $derived(Object.entries(removePreview));
	const removePreviewTotalRules = $derived(
		Object.values(removePreview).reduce((sum, v) => sum + v.rules.length, 0)
	);
	const removeSearchZoneCount = $derived(zones.length);
	const removeSearchCurrentStep = $derived(
		removeSearchTotal === 0 ? 0 : Math.min(removeSearchCompleted + 1, removeSearchTotal)
	);

	function getRemoveExpressionKey(zoneId: string, ruleIndex: number): string {
		return `${zoneId}:${ruleIndex}`;
	}

	function isRemoveExpressionExpanded(zoneId: string, ruleIndex: number): boolean {
		return removeExpandedExpressions[getRemoveExpressionKey(zoneId, ruleIndex)] === true;
	}

	function toggleRemoveExpression(zoneId: string, ruleIndex: number): void {
		const key = getRemoveExpressionKey(zoneId, ruleIndex);
		removeExpandedExpressions = {
			...removeExpandedExpressions,
			[key]: !isRemoveExpressionExpanded(zoneId, ruleIndex)
		};
	}

	async function previewRemove(): Promise<void> {
		const pattern = removeNameQuery.trim();
		if (!pattern) return;

		const zoneIdsToSearch = zones.map((zone) => zone.id);
		if (zoneIdsToSearch.length === 0) return;

		removePreviewLoading = true;
		removePreview = {};
		removeConfirmOpen = false;
		removeAcknowledged = false;
		removeProgress = {};
		removeSearchCompleted = 0;
		removeSearchTotal = zoneIdsToSearch.length;
		removeSearchCurrentZone = '';
		removeExpandedExpressions = {};
		removeSearchProgress = Object.fromEntries(zoneIdsToSearch.map((id) => [id, 'pending'])) as Record<string, BulkStatus>;

		const patternLower = pattern.toLowerCase();
		const preview: Record<string, { zoneName: string; rules: WafRule[] }> = {};
		const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]));

		for (const zoneId of zoneIdsToSearch) {
			removeSearchCurrentZone = zoneNameById.get(zoneId) ?? zoneId;
			removeSearchProgress = { ...removeSearchProgress, [zoneId]: 'running' };
			try {
				const res = await fetch(`/api/zones/${zoneId}/rules`);
				const data = (await res.json()) as RulesPayload;
				if (!res.ok) {
					removeSearchProgress = { ...removeSearchProgress, [zoneId]: 'error' };
					removeSearchCompleted += 1;
					continue;
				}

				const matched = (data.rules ?? []).filter((r) =>
					(r.description ?? '').toLowerCase().includes(patternLower)
				);
				if (matched.length > 0) {
					const zoneName = zoneNameById.get(zoneId) ?? zoneId;
					preview[zoneId] = { zoneName, rules: matched };
				}

				removeSearchProgress = { ...removeSearchProgress, [zoneId]: 'ok' };
			} catch {
				removeSearchProgress = { ...removeSearchProgress, [zoneId]: 'error' };
			}

			removeSearchCompleted += 1;
		}

		removePreview = preview;
		removePreviewLoading = false;
		removeSearchCurrentZone = '';
		removeConfirmOpen = Object.keys(preview).length > 0;

		if (Object.keys(preview).length === 0) {
			onshowtoast('ok', `No rules matching "${pattern}" found in all zones.`);
		}
	}

	async function executeRemove(): Promise<void> {
		if (!removeAcknowledged || removePreviewZones.length === 0) return;
		busy = true;
		// Keep removeConfirmOpen true so the preview panel stays visible as a live progress view

		const patternLower = removeNameQuery.trim().toLowerCase();
		const init: Record<string, BulkStatus> = {};
		for (const [zoneId] of removePreviewZones) init[zoneId] = 'pending';
		removeProgress = init;

		let removedTotal = 0;

		for (const [zoneId] of removePreviewZones) {
			removeProgress = { ...removeProgress, [zoneId]: 'running' };
			try {
				const loadRes = await fetch(`/api/zones/${zoneId}/rules`);
				const loadData = (await loadRes.json()) as RulesPayload;
				if (!loadRes.ok) throw new Error(loadData.error || 'Failed to load rules');

				const remaining = (loadData.rules ?? []).filter(
					(r) => !(r.description ?? '').toLowerCase().includes(patternLower)
				);
				removedTotal += (loadData.rules ?? []).length - remaining.length;

				const saveRes = await fetch(`/api/zones/${zoneId}/rules`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: loadData.name ?? 'Custom rules', rules: remaining })
				});
				const saveData = (await saveRes.json()) as RulesPayload;
				if (!saveRes.ok) throw new Error(saveData.error || 'Remove failed');

				removeProgress = { ...removeProgress, [zoneId]: 'ok' };
			} catch {
				removeProgress = { ...removeProgress, [zoneId]: 'error' };
			}
		}

		const { ok, err } = progressCounts(removeProgress);
		if (ok > 0 && err === 0) {
			onshowtoast('ok', `Removed ${removedTotal} rule(s) from ${ok} zone(s).`);
		} else if (err > 0) {
			onshowtoast('error', `${ok} zones succeeded, ${err} failed — see details below.`);
		}

		removeConfirmOpen = false;
		removePreview = {};
		removeAcknowledged = false;
		removeExpandedExpressions = {};
		busy = false;
	}

	// ══════════════════════════════════════════════════════════
	// CREATE & PUSH
	// ══════════════════════════════════════════════════════════

	let createDescription = $state('');
	let createExpressionText = $state('');
	let createAction = $state<WafAction>('block');
	let createBlockResponseType = $state<BlockResponseTypeValue>(DEFAULT_BLOCK_RESPONSE_TYPE);
	let createBlockStatusCode = $state(403);
	let createBlockBody = $state('');
	let createTargetZoneIds = $state<Set<string>>(new Set());
	let createTargetQuery = $state('');
	let createRuleValidated = $state(false);
	let createExpressionValidationError = $state('');
	let createProgress = $state<Record<string, BulkStatus>>({});
	let createBusy = $state(false);
	let createEditorView = $state<MatchEditorView>('expression');
	let createSimpleConditions = $state<SimpleMatchCondition[]>([]);
	let createSimpleParseError = $state('');
	let createSimpleValidationError = $state('');
	let createTagInputByCondition = $state<Record<number, string>>({});
	let createSimpleConditionSeed = 0;

	let createExprPreviewEl = $state<HTMLPreElement | null>(null);
	let createExprInputEl = $state<HTMLTextAreaElement | null>(null);

	const filteredCreateTargetZones = $derived(filterZones(createTargetQuery));

	function syncCreateExprScroll(): void {
		if (!createExprInputEl || !createExprPreviewEl) return;
		createExprPreviewEl.scrollTop = createExprInputEl.scrollTop;
		createExprPreviewEl.scrollLeft = createExprInputEl.scrollLeft;
	}

	function onCreateExpressionInput(): void {
		createRuleValidated = false;
		createExpressionValidationError = '';
		createProgress = {};
	}

	function isIpSourceField(field: MatchFieldOptionValue): boolean {
		return field === 'ip.src';
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

	function addTagToCondition(condition: SimpleMatchCondition, raw: string): void {
		const newTokens = raw
			.split(/[\s,]+/)
			.map((t) => t.trim())
			.filter(Boolean);
		if (newTokens.length === 0) return;
		const existing = getTagsFromCondition(condition);
		const seen = new Set(existing);
		for (const t of newTokens) {
			if (!seen.has(t)) {
				existing.push(t);
				seen.add(t);
			}
		}
		condition.value = existing.join(' ');
		createTagInputByCondition[condition.id] = '';
		onCreateSimpleValueChange();
	}

	function removeTagFromCondition(condition: SimpleMatchCondition, tag: string): void {
		condition.value = getTagsFromCondition(condition)
			.filter((t) => t !== tag)
			.join(' ');
		onCreateSimpleValueChange();
	}

	function onCreateTagInputKeydown(e: KeyboardEvent, condition: SimpleMatchCondition): void {
		const input = createTagInputByCondition[condition.id] ?? '';
		if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab' || e.key === ' ') && input.trim()) {
			e.preventDefault();
			addTagToCondition(condition, input);
		} else if (e.key === 'Backspace' && !input) {
			const tags = getTagsFromCondition(condition);
			if (tags.length > 0) removeTagFromCondition(condition, tags[tags.length - 1]);
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

	function getFieldValueOptions(
		field: MatchFieldOptionValue,
		operator: MatchOperatorOptionValue
	): FieldValueOption[] {
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
		createSimpleConditionSeed += 1;
		return createSimpleConditionSeed;
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

		if (
			condition.field === 'ip.src' &&
			(condition.operator === 'equals' || condition.operator === 'not_equals') &&
			value &&
			isCidrValue(value)
		) {
			return "CIDR ranges can only be used with 'in' operators. Use in set / not in set for ip.src CIDR ranges.";
		}

		if (isSetOperator(condition.operator) && !value) {
			return 'Add at least one value to the set.';
		}

		if (condition.field === 'ip.src.asnum') {
			if (
				(condition.operator === 'equals' || condition.operator === 'not_equals') &&
				value &&
				!/^[0-9]+$/.test(value)
			) {
				return 'AS numbers must be numeric (e.g. 13335 for Cloudflare).';
			}
			if (isSetOperator(condition.operator) && value) {
				const invalid = value
					.split(/\s+/)
					.filter(Boolean)
					.find((t) => !/^[0-9]+$/.test(t));
				if (invalid)
					return `"${invalid}" is not a valid AS number — AS numbers must be numeric digits only.`;
			}
		}

		if (isListOperator(condition.operator) && value && !/^[A-Za-z0-9_-]+$/.test(value)) {
			return 'List name can only contain letters, numbers, underscores, and hyphens.';
		}

		return null;
	}

	function updateCreateSimpleValidationError(): void {
		for (const condition of createSimpleConditions) {
			const message = getSimpleConditionCompatibilityError(condition);
			if (message) {
				createSimpleValidationError = message;
				return;
			}
		}
		createSimpleValidationError = '';
	}

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

	function rebuildCreateExpressionFromSimple(): void {
		if (createSimpleConditions.length === 0) return;
		createExpressionText = createSimpleConditions
			.map((condition, conditionIndex) => {
				const clause = buildClauseFromSimpleCondition(condition);
				if (conditionIndex === 0) return clause;
				return `${condition.joinWithPrevious} ${clause}`;
			})
			.join(' ');
		onCreateExpressionInput();
		updateCreateSimpleValidationError();
	}

	function parseSimpleClause(
		trimmed: string
	): Omit<SimpleMatchCondition, 'id' | 'joinWithPrevious'> | null {
		const boolTrue = trimmed.match(/\((ssl|cf\.tls_client_auth\.cert_verified|ip\.src\.is_in_european_union)\)$/);
		if (boolTrue) {
			return {
				field: boolTrue[1] as MatchFieldOptionValue,
				operator: 'equals',
				value: '',
				booleanToggleOn: true
			};
		}

		const boolFalse = trimmed.match(
			/^\(not\s+(ssl|cf\.tls_client_auth\.cert_verified|ip\.src\.is_in_european_union)\)$/
		);
		if (boolFalse) {
			return {
				field: boolFalse[1] as MatchFieldOptionValue,
				operator: 'equals',
				value: '',
				booleanToggleOn: false
			};
		}

		const numeric = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+(lt|le|gt|ge)\s+(-?\d+)\)$/
		);
		if (numeric) {
			const map: Record<string, MatchOperatorOptionValue> = {
				lt: 'less_than',
				le: 'less_than_or_equal',
				gt: 'greater_than',
				ge: 'greater_than_or_equal'
			};
			return {
				field: numeric[1] as MatchFieldOptionValue,
				operator: map[numeric[2]],
				value: numeric[3],
				booleanToggleOn: true
			};
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
			return {
				field: direct[1] as MatchFieldOptionValue,
				operator: op,
				value: unescapeExpressionValue(direct[4]),
				booleanToggleOn: true
			};
		}

		const negDirect = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+(contains|matches)\s+(r?)"((?:\\.|[^"\\])*)"\)$/
		);
		if (negDirect) {
			const map: Record<string, MatchOperatorOptionValue> = {
				contains: 'not_contains',
				matches: 'not_matches_regex'
			};
			const op = map[negDirect[2]];
			if (!op) return null;
			return {
				field: negDirect[1] as MatchFieldOptionValue,
				operator: op,
				value: unescapeExpressionValue(negDirect[4]),
				booleanToggleOn: true
			};
		}

		const fnDirect = trimmed.match(
			/^\((starts_with|ends_with)\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+),\s*"((?:\\.|[^"\\])*)"\)\)$/
		);
		if (fnDirect) {
			return {
				field: fnDirect[2] as MatchFieldOptionValue,
				operator: fnDirect[1] === 'starts_with' ? 'starts_with' : 'ends_with',
				value: unescapeExpressionValue(fnDirect[3]),
				booleanToggleOn: true
			};
		}

		const fnNeg = trimmed.match(
			/^\(not\s+(starts_with|ends_with)\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+),\s*"((?:\\.|[^"\\])*)"\)\)$/
		);
		if (fnNeg) {
			return {
				field: fnNeg[2] as MatchFieldOptionValue,
				operator: fnNeg[1] === 'starts_with' ? 'not_starts_with' : 'not_ends_with',
				value: unescapeExpressionValue(fnNeg[3]),
				booleanToggleOn: true
			};
		}

		const inSet = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\{([^}]*)\}\)$/
		);
		if (inSet) {
			return {
				field: inSet[1] as MatchFieldOptionValue,
				operator: 'in_set',
				value: inSet[2].trim(),
				booleanToggleOn: true
			};
		}

		const notInSet = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\{([^}]*)\}\)$/
		);
		if (notInSet) {
			return {
				field: notInSet[1] as MatchFieldOptionValue,
				operator: 'not_in_set',
				value: notInSet[2].trim(),
				booleanToggleOn: true
			};
		}

		const inList = trimmed.match(
			/^\((http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\$([A-Za-z0-9_]+)\)$/
		);
		if (inList) {
			return {
				field: inList[1] as MatchFieldOptionValue,
				operator: 'in_list',
				value: inList[2],
				booleanToggleOn: true
			};
		}

		const notInList = trimmed.match(
			/^\(not\s+(http\.[A-Za-z0-9_.]+|ip\.src(?:\.[A-Za-z0-9_.]+)?|cf\.[A-Za-z0-9_.]+)\s+in\s+\$([A-Za-z0-9_]+)\)$/
		);
		if (notInList) {
			return {
				field: notInList[1] as MatchFieldOptionValue,
				operator: 'not_in_list',
				value: notInList[2],
				booleanToggleOn: true
			};
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

	function initializeSimpleModeForCreate(): void {
		const expression = createExpressionText.trim();
		if (!expression) {
			createSimpleParseError = '';
			createSimpleConditions = [defaultSimpleCondition()];
			updateCreateSimpleValidationError();
			return;
		}

		const parsed = parseExpressionToSimpleConditions(expression);
		if (!parsed) {
			createSimpleParseError =
				'This expression cannot be represented in Simple View. Switch to Expression View to edit it directly.';
			createSimpleConditions = [defaultSimpleCondition()];
			updateCreateSimpleValidationError();
			return;
		}

		createSimpleParseError = '';
		createSimpleConditions = parsed;
		updateCreateSimpleValidationError();
	}

	function setCreateEditorView(view: MatchEditorView): void {
		createEditorView = view;
		if (view === 'simple') initializeSimpleModeForCreate();
	}

	function addCreateSimpleCondition(joinWithPrevious: MatchJoin): void {
		const current = createSimpleConditions.length > 0 ? createSimpleConditions : [defaultSimpleCondition()];
		createSimpleConditions = [...current, defaultSimpleCondition(joinWithPrevious)];
		rebuildCreateExpressionFromSimple();
	}

	function removeCreateSimpleCondition(conditionId: number): void {
		const current = createSimpleConditions;
		if (current.length <= 1) return;
		const filtered = current.filter((c) => c.id !== conditionId);
		if (filtered.length > 0) filtered[0].joinWithPrevious = 'and';
		createSimpleConditions = filtered;
		rebuildCreateExpressionFromSimple();
	}

	function onCreateSimpleFieldChange(conditionId: number, field: MatchFieldOptionValue): void {
		for (const c of createSimpleConditions) {
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
		rebuildCreateExpressionFromSimple();
	}

	function onCreateSimpleOperatorChange(conditionId: number, operator: MatchOperatorOptionValue): void {
		for (const c of createSimpleConditions) {
			if (c.id !== conditionId) continue;
			if (!isOperatorAllowedForField(c.field, operator)) continue;
			c.operator = operator;
		}
		rebuildCreateExpressionFromSimple();
	}

	function onCreateSimpleJoinChange(conditionId: number, join: MatchJoin): void {
		for (const c of createSimpleConditions) {
			if (c.id !== conditionId) continue;
			c.joinWithPrevious = join;
		}
		rebuildCreateExpressionFromSimple();
	}

	function onCreateSimpleValueChange(): void {
		rebuildCreateExpressionFromSimple();
	}

	function onCreateSimpleBooleanToggleChange(): void {
		rebuildCreateExpressionFromSimple();
	}

	function resetCreateSimpleExpression(): void {
		createSimpleParseError = '';
		createSimpleConditions = [defaultSimpleCondition()];
		rebuildCreateExpressionFromSimple();
	}

	function toggleCreateTarget(zoneId: string): void {
		const next = new Set(createTargetZoneIds);
		if (next.has(zoneId)) next.delete(zoneId);
		else next.add(zoneId);
		createTargetZoneIds = next;
		createProgress = {};
	}

	function selectAllCreateTargets(): void {
		createTargetZoneIds = new Set(filteredCreateTargetZones.map((z) => z.id));
		createProgress = {};
	}

	function deselectAllCreateTargets(): void {
		createTargetZoneIds = new Set();
		createProgress = {};
	}

	async function validateCreateRule(): Promise<void> {
		createRuleValidated = false;
		createExpressionValidationError = '';
		try {
			if (!createExpressionText.trim()) throw new Error('Expression is required.');

			if (createSimpleValidationError) {
				throw new Error(createSimpleValidationError);
			}

			const res = await fetch('/api/expressions/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ expression: createExpressionText.trim() })
			});
			const data = (await res.json()) as { valid?: boolean; error?: string };
			if (!res.ok || data.valid === false) throw new Error(data.error || 'Expression is invalid.');

			if (
				createAction === 'block' &&
				createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE &&
				!createBlockBody.trim()
			) {
				throw new Error('Response body is required when using a custom block response.');
			}

			createRuleValidated = true;
			onshowtoast('ok', 'Rule is valid — select target zones and push.');
		} catch (err) {
			createExpressionValidationError = err instanceof Error ? err.message : 'Validation failed';
			onshowtoast('error', createExpressionValidationError);
		}
	}

	async function executeBulkCreate(): Promise<void> {
		if (!createRuleValidated || createTargetZoneIds.size === 0) return;
		createBusy = true;

		const rule: WafRule = {
			description: createDescription.trim() || undefined,
			expression: createExpressionText.trim(),
			action: createAction,
			enabled: true
		};

		if (
			createAction === 'block' &&
			createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE &&
			createBlockBody.trim()
		) {
			rule.action_parameters = {
				response: {
					status_code: createBlockStatusCode,
					content: createBlockBody.trim(),
					content_type: createBlockResponseType as string
				}
			};
		}

		const init: Record<string, BulkStatus> = {};
		for (const id of createTargetZoneIds) init[id] = 'pending';
		createProgress = init;

		for (const zoneId of createTargetZoneIds) {
			createProgress = { ...createProgress, [zoneId]: 'running' };
			try {
				const loadRes = await fetch(`/api/zones/${zoneId}/rules`);
				const loadData = (await loadRes.json()) as RulesPayload;
				if (!loadRes.ok) throw new Error(loadData.error || 'Failed to load target zone rules');

				const merged = [...(loadData.rules ?? []), rule];
				const saveRes = await fetch(`/api/zones/${zoneId}/rules`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: loadData.name ?? 'Custom rules', rules: merged })
				});
				const saveData = (await saveRes.json()) as RulesPayload;
				if (!saveRes.ok) throw new Error(saveData.error || 'Push failed');

				createProgress = { ...createProgress, [zoneId]: 'ok' };
			} catch {
				createProgress = { ...createProgress, [zoneId]: 'error' };
			}
		}

		const { ok, err } = progressCounts(createProgress);
		if (ok > 0 && err === 0) {
			onshowtoast('ok', `Rule pushed to ${ok} zone(s) successfully.`);
		} else if (err > 0) {
			onshowtoast('error', `${ok} zones succeeded, ${err} failed — see details below.`);
		}

		createBusy = false;
	}

	function resetCreateForm(): void {
		createDescription = '';
		createExpressionText = '';
		createAction = 'block';
		createBlockResponseType = DEFAULT_BLOCK_RESPONSE_TYPE;
		createBlockStatusCode = 403;
		createBlockBody = '';
		createRuleValidated = false;
		createExpressionValidationError = '';
		createEditorView = 'expression';
		createSimpleConditions = [];
		createSimpleParseError = '';
		createSimpleValidationError = '';
		createTagInputByCondition = {};
		createProgress = {};
	}
</script>

<!-- ── Sub-tab bar ──────────────────────────────────────────── -->
<div class="bulk-tab-bar">
	<button
		type="button"
		class="bulk-tab-btn {bulkTab === 'copy' ? 'active' : ''}"
		onclick={() => (bulkTab = 'copy')}
	>
		Copy Rules
	</button>
	<button
		type="button"
		class="bulk-tab-btn {bulkTab === 'remove' ? 'active' : ''}"
		onclick={() => (bulkTab = 'remove')}
	>
		Remove by Name
	</button>
	<button
		type="button"
		class="bulk-tab-btn {bulkTab === 'create' ? 'active' : ''}"
		onclick={() => (bulkTab = 'create')}
	>
		Create &amp; Push
	</button>
</div>

<!-- ════════════════════════════════════════════════════════════
     COPY RULES
════════════════════════════════════════════════════════════ -->
{#if bulkTab === 'copy'}
	<div class="stack">
		<p class="muted" style="margin: 0;">Copy selected rules from the source zone (selected above) to one or more target zones. Rules are appended to each target zone's existing ruleset.</p>

		{#if sourceRules.length === 0}
			<p class="muted">No rules loaded from the source zone. Select a zone and load its rules via the Manage tab first.</p>
		{:else}
			<!-- Rule selection -->
			<div class="stack" style="gap: 0.3rem;">
				<div class="row">
					<span class="label">{copySelection.size} of {sourceRules.length} rule(s) selected</span>
					<button class="button secondary" type="button" onclick={selectAllForCopy}>Select All</button>
					<button class="button secondary" type="button" onclick={deselectAllForCopy}>Deselect All</button>
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
							{#each sourceRules as rule, index}
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
			</div>

			<!-- Target zone selection -->
			<div class="stack" style="gap: 0.3rem;">
				<label class="muted" for="copy-target-filter">Filter target zones</label>
				<input
					id="copy-target-filter"
					class="input"
					type="text"
					placeholder="Filter zones…"
					bind:value={copyTargetQuery}
				/>
			</div>
			<div class="stack" style="gap: 0.3rem;">
				<div class="row">
					<span class="label">Target zones ({copyTargetZoneIds.size} selected)</span>
					<button
						class="button secondary"
						style="font-size: 0.68rem; padding: 0.18rem 0.45rem;"
						type="button"
						onclick={selectAllCopyTargets}>All</button
					>
					<button
						class="button secondary"
						style="font-size: 0.68rem; padding: 0.18rem 0.45rem;"
						type="button"
						onclick={deselectAllCopyTargets}>None</button
					>
				</div>
				<div class="copy-target-list">
					{#each filteredCopyTargetZones as zone (zone.id)}
						<label class="copy-target-item">
							<input
								type="checkbox"
								checked={copyTargetZoneIds.has(zone.id)}
								onchange={() => toggleCopyTarget(zone.id)}
							/>
							<span>{zone.name}</span>
							{#if copyProgress[zone.id] === 'pending'}
								<span class="bulk-status pending" style="margin-left: auto;">queued</span>
							{:else if copyProgress[zone.id] === 'running'}
								<span class="bulk-status running" style="margin-left: auto;">copying…</span>
							{:else if copyProgress[zone.id] === 'ok'}
								<span class="bulk-status ok" style="margin-left: auto;">✓ done</span>
							{:else if copyProgress[zone.id] === 'error'}
								<span class="bulk-status error" style="margin-left: auto;">✗ failed</span>
							{/if}
						</label>
					{/each}
					{#if filteredCopyTargetZones.length === 0}
						<span class="label">No matching zones</span>
					{/if}
				</div>
			</div>

			<div class="row">
				<button
					class="button"
					type="button"
					onclick={executeCopy}
					disabled={busy || copyTargetZoneIds.size === 0 || copySelection.size === 0}
				>
					{#if busy}
						Copying… ({progressCounts(copyProgress).done} / {copyTargetZoneIds.size})
					{:else}
						Copy {copySelection.size} Rule(s) to {copyTargetZoneIds.size} Zone(s)
					{/if}
				</button>
			</div>
		{/if}
	</div>

<!-- ════════════════════════════════════════════════════════════
     REMOVE BY NAME
════════════════════════════════════════════════════════════ -->
{:else if bulkTab === 'remove'}
	<div class="stack">
		<div class="danger-banner">
			<strong>Destructive Operation</strong> — rules removed here cannot be recovered. Preview all matches carefully before confirming.
		</div>

		<!-- Name pattern -->
		<label class="stack">
			<span class="label">Rule name contains</span>
			<input
				class="input mono"
				type="text"
				placeholder="e.g. Block bad bots"
				bind:value={removeNameQuery}
				oninput={() => { removePreview = {}; removeConfirmOpen = false; removeProgress = {}; removeSearchProgress = {}; removeSearchCurrentZone = ''; removeSearchCompleted = 0; removeSearchTotal = 0; removeExpandedExpressions = {}; }}
			/>
		</label>
		<div class="row">
			<button
				class="button secondary"
				type="button"
				onclick={previewRemove}
				disabled={busy || removePreviewLoading || !removeNameQuery.trim() || zones.length === 0}
			>
				{removePreviewLoading ? 'Searching…' : `Search ${removeSearchZoneCount} Zone(s)`}
			</button>
		</div>

		{#if removePreviewLoading}
			<div class="status" style="border-color: var(--stroke); background: oklch(0.16 0 0); color: var(--text);">
				Searching zone {removeSearchCurrentStep} of {removeSearchTotal}: <strong>{removeSearchCurrentZone || 'Starting...'}</strong>
			</div>
			<div class="copy-target-list">
				{#each zones as zone (zone.id)}
					{#if removeSearchProgress[zone.id]}
						<div class="copy-target-item">
							<span>{zone.name}</span>
							{#if removeSearchProgress[zone.id] === 'pending'}
								<span class="bulk-status pending" style="margin-left: auto;">queued</span>
							{:else if removeSearchProgress[zone.id] === 'running'}
								<span class="bulk-status running" style="margin-left: auto;">searching…</span>
							{:else if removeSearchProgress[zone.id] === 'ok'}
								<span class="bulk-status ok" style="margin-left: auto;">scanned</span>
							{:else if removeSearchProgress[zone.id] === 'error'}
								<span class="bulk-status error" style="margin-left: auto;">failed</span>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		<!-- Preview results + confirmation -->
		{#if removeConfirmOpen && removePreviewZones.length > 0}
			<div class="remove-preview">
				<div class="remove-preview-header">
					<span>Found <strong>{removePreviewTotalRules}</strong> rule(s) matching <code>"{removeNameQuery}"</code> across <strong>{removePreviewZones.length}</strong> zone(s)</span>
				</div>

				{#each removePreviewZones as [zoneId, { zoneName, rules }]}
					<div class="remove-preview-zone">
						<div class="remove-preview-zone-name" style="display: flex; align-items: center; gap: 0.5rem;">
							<span>{zoneName}</span>
							{#if removeProgress[zoneId] === 'pending'}
								<span class="bulk-status pending">queued</span>
							{:else if removeProgress[zoneId] === 'running'}
								<span class="bulk-status running">removing…</span>
							{:else if removeProgress[zoneId] === 'ok'}
								<span class="bulk-status ok">✓ done</span>
							{:else if removeProgress[zoneId] === 'error'}
								<span class="bulk-status error">✗ failed</span>
							{/if}
						</div>
						<div style="overflow-x: auto;">
							<table>
								<thead>
									<tr>
										<th style="width: 5%;">#</th>
										<th style="width: 30%;">Name</th>
										<th style="width: 45%;">Expression</th>
										<th style="width: 15%;">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each rules as rule, i}
										<tr class="remove-preview-row">
											<td>{i + 1}</td>
											<td>{rule.description || '(unnamed)'}</td>
											<td>
												<div class="stack" style="gap: 0.25rem;">
													<div class="mono" style="font-size: 0.68rem; white-space: pre-wrap; overflow-wrap: anywhere;">
														{#if isRemoveExpressionExpanded(zoneId, i)}
															{rule.expression || ''}
														{:else}
															{truncate(rule.expression || '', 55)}
														{/if}
													</div>
													{#if (rule.expression || '').length > 55}
														<button
															class="button secondary"
															type="button"
															style="font-size: 0.66rem; padding: 0.15rem 0.42rem; width: fit-content;"
															onclick={() => toggleRemoveExpression(zoneId, i)}
														>
															{isRemoveExpressionExpanded(zoneId, i) ? 'Collapse' : 'Expand'}
														</button>
													{/if}
												</div>
											</td>
											<td><span class="action-badge {rule.action}">{actionLabel(rule.action)}</span></td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/each}

				<label class="remove-acknowledge-row">
					<input type="checkbox" bind:checked={removeAcknowledged} />
					<span>I have reviewed the rules above and understand this deletion is <strong>permanent and irreversible</strong>.</span>
				</label>

				<div class="row">
					<button
						class="button secondary"
						type="button"
						onclick={() => { removeConfirmOpen = false; removeAcknowledged = false; }}
					>
						Cancel
					</button>
					<button
						class="button danger"
						type="button"
						onclick={executeRemove}
						disabled={busy || !removeAcknowledged}
					>
						{#if busy}
							Removing… ({progressCounts(removeProgress).done} / {removePreviewZones.length})
						{:else}
							Remove {removePreviewTotalRules} Rule(s) from {removePreviewZones.length} Zone(s)
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</div>

<!-- ════════════════════════════════════════════════════════════
     CREATE & PUSH
════════════════════════════════════════════════════════════ -->
{:else if bulkTab === 'create'}
	<div class="stack">
		<p class="muted" style="margin: 0;">Build a new rule and push it to multiple zones simultaneously. The rule will be <strong>appended</strong> to each zone's existing ruleset.</p>

		<label class="stack">
			<span class="label">Rule name (optional)</span>
			<input class="input" type="text" placeholder="e.g. Block bad bots" bind:value={createDescription} />
		</label>

		<!-- Expression editor -->
		<div class="stack">
			<div class="row">
				<span class="label">Match expression</span>
				<button
					type="button"
					class="button {createEditorView === 'expression' ? '' : 'secondary'}"
					onclick={() => setCreateEditorView('expression')}
				>
					Expression View
				</button>
				<button
					type="button"
					class="button {createEditorView === 'simple' ? '' : 'secondary'}"
					onclick={() => setCreateEditorView('simple')}
				>
					Simple View
				</button>
			</div>

			{#if createEditorView === 'expression'}
				<div class="expression-editor mono">
					<pre class="expression-highlight" bind:this={createExprPreviewEl}>{@html highlightExpression(createExpressionText || '')}</pre>
					<textarea
						class="expression-input"
						bind:this={createExprInputEl}
						bind:value={createExpressionText}
						onscroll={syncCreateExprScroll}
						oninput={() => { syncCreateExprScroll(); onCreateExpressionInput(); }}
						spellcheck="false"
						placeholder='(ip.src.country eq "GB") and (cf.waf.score lt 20)'
					></textarea>
				</div>
			{:else}
				{#if createSimpleParseError}
					<div class="status error">{createSimpleParseError}</div>
					<div class="row">
						<button class="button secondary" type="button" onclick={resetCreateSimpleExpression}>
							Start New Simple Expression
						</button>
					</div>
				{/if}

				{#if createSimpleValidationError}
					<div class="status error">{createSimpleValidationError}</div>
				{/if}

				{#if createSimpleConditions.length > 0}
					<div class="stack">
						{#each createSimpleConditions as condition, conditionIndex}
							{#if conditionIndex > 0}
								<div class="join-connector">
									<div class="join-line"></div>
									<button type="button" class="join-pill {condition.joinWithPrevious === 'and' ? 'active-and' : ''}" onclick={() => onCreateSimpleJoinChange(condition.id, 'and')}>AND</button>
									<button type="button" class="join-pill {condition.joinWithPrevious === 'or' ? 'active-or' : ''}" onclick={() => onCreateSimpleJoinChange(condition.id, 'or')}>OR</button>
									<div class="join-line"></div>
								</div>
							{/if}

							<div class="panel stack">
								<div class="grid-2">
									<label class="stack">
										<span class="label">Field</span>
										<select class="select mono" bind:value={condition.field} onchange={() => onCreateSimpleFieldChange(condition.id, condition.field)}>
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
											<select class="select mono" bind:value={condition.operator} onchange={() => onCreateSimpleOperatorChange(condition.id, condition.operator)}>
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
										<button type="button" class="button {condition.booleanToggleOn ? '' : 'secondary'}" onclick={() => { condition.booleanToggleOn = true; onCreateSimpleBooleanToggleChange(); }}>On</button>
										<button type="button" class="button {condition.booleanToggleOn ? 'secondary' : ''}" onclick={() => { condition.booleanToggleOn = false; onCreateSimpleBooleanToggleChange(); }}>Off</button>
									</div>
								{:else if isListOperator(condition.operator)}
									<label class="stack">
										<span class="label">List</span>
										{#if cfListsLoading}
											<input class="input mono" value="Loading lists…" disabled />
										{:else if cfLists.length === 0}
											<input class="input mono" bind:value={condition.value} oninput={onCreateSimpleValueChange} placeholder="list_name (no lists found)" />
										{:else}
											<select class="select mono" bind:value={condition.value} onchange={onCreateSimpleValueChange}>
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
										<select class="select mono" bind:value={condition.value} onchange={onCreateSimpleValueChange}>
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
													<button type="button" class="tag-chip-remove" onclick={() => removeTagFromCondition(condition, tag)} aria-label="Remove {tag}">×</button>
												</span>
											{/each}
											<input
												class="tag-input-field mono"
												type="text"
												value={createTagInputByCondition[condition.id] ?? ''}
												oninput={(e) => {
													createTagInputByCondition[condition.id] = (e.target as HTMLInputElement).value;
												}}
												onkeydown={(e) => onCreateTagInputKeydown(e, condition)}
												onblur={(e) => {
													const v = (e.target as HTMLInputElement).value.trim();
													if (v) {
														addTagToCondition(condition, v);
														(e.target as HTMLInputElement).value = '';
													}
												}}
												placeholder={getTagsFromCondition(condition).length === 0
													? 'e.g. 192.0.2.0 or 203.0.113.0/24'
													: ''}
											/>
										</div>
									</label>
								{:else}
									<label class="stack">
										<span class="label">Value</span>
										<input class="input mono" bind:value={condition.value} oninput={onCreateSimpleValueChange} placeholder={simpleValuePlaceholder(condition.operator)} />
									</label>
								{/if}

								<div class="row" style="justify-content: flex-end;">
									<button class="button secondary" type="button" onclick={() => removeCreateSimpleCondition(condition.id)}>Remove Row</button>
								</div>
							</div>
						{/each}
					</div>

					<div class="row">
						<button class="button secondary" type="button" onclick={() => addCreateSimpleCondition('and')}>+ AND condition</button>
						<button class="button secondary" type="button" onclick={() => addCreateSimpleCondition('or')}>+ OR condition</button>
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
				<select
					class="select"
					bind:value={createAction}
					onchange={() => {
						createRuleValidated = false;
						createProgress = {};
					}}
				>
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
						<select
							class="select"
							bind:value={createBlockResponseType}
							onchange={() => {
								createRuleValidated = false;
							}}
						>
							{#each BLOCK_RESPONSE_TYPES as rt}
								<option value={rt.value}>{rt.label}</option>
							{/each}
						</select>
					</label>
					<label class="stack">
						<span class="label">Status code (400–499)</span>
						<input
							class="input mono"
							type="number"
							min="400"
							max="499"
							bind:value={createBlockStatusCode}
							disabled={createBlockResponseType === DEFAULT_BLOCK_RESPONSE_TYPE}
						/>
					</label>
				</div>
				{#if createBlockResponseType !== DEFAULT_BLOCK_RESPONSE_TYPE}
					<label class="stack">
						<span class="label">Response body</span>
						<textarea
							class="textarea mono"
							bind:value={createBlockBody}
							placeholder="Your request was blocked."
						></textarea>
					</label>
				{/if}
			</div>
		{/if}

		<!-- Target zone selection -->
		<div class="stack" style="gap: 0.3rem;">
			<label class="muted" for="create-target-filter">Filter target zones</label>
			<input
				id="create-target-filter"
				class="input"
				type="text"
				placeholder="Filter zones…"
				bind:value={createTargetQuery}
			/>
		</div>
		<div class="stack" style="gap: 0.3rem;">
			<div class="row">
				<span class="label">Target zones ({createTargetZoneIds.size} selected)</span>
				<button
					class="button secondary"
					style="font-size: 0.68rem; padding: 0.18rem 0.45rem;"
					type="button"
					onclick={selectAllCreateTargets}>All</button
				>
				<button
					class="button secondary"
					style="font-size: 0.68rem; padding: 0.18rem 0.45rem;"
					type="button"
					onclick={deselectAllCreateTargets}>None</button
				>
			</div>
			<div class="copy-target-list">
				{#each filteredCreateTargetZones as zone (zone.id)}
					<label class="copy-target-item">
						<input
							type="checkbox"
							checked={createTargetZoneIds.has(zone.id)}
							onchange={() => toggleCreateTarget(zone.id)}
						/>
						<span>{zone.name}</span>
						{#if createProgress[zone.id] === 'pending'}
							<span class="bulk-status pending" style="margin-left: auto;">queued</span>
						{:else if createProgress[zone.id] === 'running'}
							<span class="bulk-status running" style="margin-left: auto;">pushing…</span>
						{:else if createProgress[zone.id] === 'ok'}
							<span class="bulk-status ok" style="margin-left: auto;">✓ done</span>
						{:else if createProgress[zone.id] === 'error'}
							<span class="bulk-status error" style="margin-left: auto;">✗ failed</span>
						{/if}
					</label>
				{/each}
				{#if filteredCreateTargetZones.length === 0}
					<span class="label">No matching zones</span>
				{/if}
			</div>
		</div>

		<div class="row">
			<button class="button secondary" type="button" onclick={validateCreateRule} disabled={createBusy}>
				Validate Rule
			</button>
			{#if createRuleValidated}
				<button
					class="button"
					type="button"
					onclick={executeBulkCreate}
					disabled={createBusy || createTargetZoneIds.size === 0}
				>
					{#if createBusy}
						Pushing… ({progressCounts(createProgress).done} / {createTargetZoneIds.size})
					{:else}
						Push to {createTargetZoneIds.size} Zone(s)
					{/if}
				</button>
				<button class="button secondary" type="button" onclick={resetCreateForm}>
					Reset
				</button>
			{/if}
		</div>

		{#if createRuleValidated}
			<div class="status ok">Rule validated — select target zones and push.</div>
		{/if}
	</div>
{/if}
