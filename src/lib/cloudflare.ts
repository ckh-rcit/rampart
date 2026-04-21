import { env } from '$env/dynamic/private';
import type { WafRule, ZoneSummary, CfList } from '$lib/types';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const CUSTOM_RULES_PHASE = 'http_request_firewall_custom';

interface CfResponse<T> {
	success: boolean;
	errors?: Array<{ message?: string }>;
	result: T;
	result_info?: {
		page: number;
		per_page: number;
		total_pages: number;
	};
}

interface CfRuleset {
	id?: string;
	name: string;
	kind: 'zone';
	phase: string;
	rules: WafRule[];
}

interface CfRulesetUpdatePayload {
	name: string;
	rules: WafRule[];
}

function getHeaders(): HeadersInit {
	if (!env.CLOUDFLARE_API_TOKEN) {
		throw new Error('Missing CLOUDFLARE_API_TOKEN environment variable.');
	}

	return {
		Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
		'Content-Type': 'application/json'
	};
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			...getHeaders(),
			...(init?.headers ?? {})
		}
	});

	const data = (await response.json()) as CfResponse<T>;

	if (!response.ok || !data.success) {
		const detail = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'Cloudflare API error';
		throw new Error(detail);
	}

	return data;
}

export async function listZones(): Promise<ZoneSummary[]> {
	let page = 1;
	let totalPages = 1;
	const zones: ZoneSummary[] = [];

	do {
		const data = await cfFetch<Array<{ id: string; name: string; account: { id: string } }>>(`/zones?per_page=100&page=${page}`);
		zones.push(...data.result.map((z) => ({ id: z.id, name: z.name, accountId: z.account.id })));
		totalPages = data.result_info?.total_pages ?? 1;
		page += 1;
	} while (page <= totalPages);

	return zones.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listLists(accountId: string): Promise<CfList[]> {
	const data = await cfFetch<Array<{ id: string; name: string; kind: string; num_items: number }>>(
		`/accounts/${accountId}/rules/lists`
	);
	return data.result.map((l) => ({
		id: l.id,
		name: l.name,
		kind: l.kind as CfList['kind'],
		num_items: l.num_items
	}));
}

export async function getCustomRulesEntrypoint(zoneId: string): Promise<CfRuleset | null> {
	const response = await fetch(`${API_BASE}/zones/${zoneId}/rulesets/phases/${CUSTOM_RULES_PHASE}/entrypoint`, {
		headers: getHeaders()
	});

	if (response.status === 404) {
		return null;
	}

	const data = (await response.json()) as CfResponse<CfRuleset>;
	if (!response.ok || !data.success) {
		const detail = data.errors?.map((e) => e.message).filter(Boolean).join('; ') || 'Cloudflare API error';
		throw new Error(detail);
	}

	return data.result;
}

export async function upsertCustomRulesEntrypoint(zoneId: string, payload: CfRuleset): Promise<CfRuleset> {
	const exists = await getCustomRulesEntrypoint(zoneId);

	if (!exists) {
		const created = await cfFetch<CfRuleset>(`/zones/${zoneId}/rulesets`, {
			method: 'POST',
			body: JSON.stringify(payload)
		});
		return created.result;
	}

	const updatePayload: CfRulesetUpdatePayload = {
		name: payload.name,
		rules: payload.rules
	};

	const updated = await cfFetch<CfRuleset>(
		`/zones/${zoneId}/rulesets/phases/${CUSTOM_RULES_PHASE}/entrypoint`,
		{
			method: 'PUT',
			body: JSON.stringify(updatePayload)
		}
	);

	return updated.result;
}

export function buildRulesetPayload(name: string, rules: WafRule[]): CfRuleset {
	return {
		name,
		kind: 'zone',
		phase: CUSTOM_RULES_PHASE,
		rules
	};
}
