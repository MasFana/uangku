import { DashboardRepo, type DashboardSummary } from '../repos/dashboard';
import type { AppEvent } from '../types';
import { assertUser } from '../types';
import { getDashboard, setDashboard } from '../cache';

export async function getDashboardSummary(event: AppEvent): Promise<DashboardSummary> {
	const { userId, db } = assertUser(event);

	const cached = await getDashboard(event, userId);
	if (cached) {
		return cached;
	}

	const repo = new DashboardRepo(db);
	const summary = await repo.getSummary(userId);

	await setDashboard(event, userId, summary);

	return summary;
}
