import { json } from '@sveltejs/kit';
import { buildRulesetPayload, getCustomRulesEntrypoint, upsertCustomRulesEntrypoint } from '$lib/cloudflare';
import type { WafRule } from '$lib/types';

interface PutBody {
	name?: string;
	rules: WafRule[];
}

export async function GET({ params }: { params: { zoneId: string } }) {
	try {
		const ruleset = await getCustomRulesEntrypoint(params.zoneId);
		return json({
			rulesetId: ruleset?.id ?? null,
			name: ruleset?.name ?? 'Custom rules',
			rules: ruleset?.rules ?? []
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to load ruleset';
		return json({ error: message }, { status: 500 });
	}
}

export async function PUT({ params, request }: { params: { zoneId: string }; request: Request }) {
	try {
		const body = (await request.json()) as PutBody;
		if (!Array.isArray(body.rules)) {
			return json({ error: 'Request body must include rules array.' }, { status: 400 });
		}

		const ruleset = await upsertCustomRulesEntrypoint(
			params.zoneId,
			buildRulesetPayload(body.name ?? 'Custom rules', body.rules)
		);

		return json({
			rulesetId: ruleset.id,
			name: ruleset.name,
			rules: ruleset.rules
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to update ruleset';
		return json({ error: message }, { status: 500 });
	}
}
