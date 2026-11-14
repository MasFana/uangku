import { json, type RequestHandler } from '@sveltejs/kit';
import { assertUser } from '$lib/server/types';

export const POST: RequestHandler = async (event) => {
	const { userId } = assertUser(event as any);
	const r2 = (event.locals as any).r2;

	if (!r2) {
		return json({ error: 'R2 storage not configured' }, { status: 500 });
	}

	const formData = await event.request.formData();
	const file = formData.get('file') as File | null;
	const key = formData.get('key') as string | null;

	if (!file || !key) {
		return json({ error: 'Missing file or key' }, { status: 400 });
	}

	// Scope key to user to avoid collision
	const receiptKey = key.startsWith(`${userId}/`) ? key : `${userId}/${key}`;
	const arrayBuffer = await file.arrayBuffer();

	await r2.put(receiptKey, arrayBuffer, {
		httpMetadata: {
			contentType: file.type || 'image/webp'
		}
	});

	return json({ receiptKey, success: true });
};
