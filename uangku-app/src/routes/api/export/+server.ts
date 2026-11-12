import type { RequestHandler } from '@sveltejs/kit';
import { streamTransactionsCsv } from '$lib/server/services/export';

export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user?.id) {
		return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const today = new Date().toISOString().slice(0, 10);
	const filename = `uangku-transaksi-${today}.csv`;

	const stream = streamTransactionsCsv(event);

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-cache, no-store'
		}
	});
};
