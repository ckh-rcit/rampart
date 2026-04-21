import { json } from '@sveltejs/kit';
import { listLists } from '$lib/cloudflare';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const accountId = url.searchParams.get('accountId');
	if (!accountId) {
		return json({ error: 'Missing accountId parameter' }, { status: 400 });
	}

	try {
		const lists = await listLists(accountId);
		return json({ lists });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to load lists';
		return json({ error: message }, { status: 500 });
	}
};
