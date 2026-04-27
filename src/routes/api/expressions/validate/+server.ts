import { json } from '@sveltejs/kit';
import { validateRulesExpression } from '$lib/cloudflare';
import type { RequestHandler } from './$types';

interface ValidateBody {
	expression?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as ValidateBody;
		const expression = body.expression?.trim() ?? '';

		if (!expression) {
			return json({ error: 'Expression is required.' }, { status: 400 });
		}

		await validateRulesExpression(expression);
		return json({ valid: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Expression is invalid.';
		return json({ valid: false, error: message }, { status: 400 });
	}
};
