/**
 * Shared Sync Contract & DTOs
 * Used across client IndexedDB, sync engine, API endpoints, and Drizzle models.
 */

export type WalletType = 'cash' | 'bank' | 'ewallet' | 'other';
export type CategoryKind = 'expense' | 'income';
export type TransactionType = 'expense' | 'income' | 'transfer';

export interface BaseEntityDTO {
	id: string;
	userId: string;
	hlc: string;
	serverUpdatedAt: number; // Watermark cursor (epoch ms assigned by server)
	deletedAt: string | null; // ISO string for soft-delete tombstone
	createdAt: string; // ISO string
}

export interface WalletDTO extends BaseEntityDTO {
	name: string;
	type: WalletType;
	initialBalance: number;
	currentBalance: number;
	icon: string | null;
	archived: boolean;
}

export interface CategoryDTO extends BaseEntityDTO {
	name: string;
	kind: CategoryKind;
	icon: string | null;
	color: string | null;
	archived: boolean;
}

export interface TransactionDTO extends BaseEntityDTO {
	walletId: string;
	categoryId: string | null;
	type: TransactionType;
	amount: number;
	transferWalletId: string | null;
	note: string | null;
	occurredAt: string; // ISO string
	receiptKey: string | null;
	updatedAt: string; // ISO string
}

export interface MonthlyRollupDTO {
	userId: string;
	ym: string; // 'YYYY-MM'
	type: TransactionType;
	categoryId: string | null;
	walletId: string;
	totalAmount: number;
	txCount: number;
}

export interface DailyRollupDTO {
	userId: string;
	ymd: string; // 'YYYY-MM-DD'
	walletId: string;
	incomeAmount: number;
	expenseAmount: number;
	transferInAmount: number;
	transferOutAmount: number;
	txCount: number;
}

export interface DashboardSummaryDTO {
	totalBalance: number;
	wallets: WalletDTO[];
	currentMonth: {
		income: number;
		expense: number;
		net: number;
	};
	recentTransactions: Array<{
		id: string;
		walletId: string;
		categoryId: string | null;
		type: TransactionType;
		amount: number;
		transferWalletId: string | null;
		note: string | null;
		occurredAt: string;
	}>;
	categoryBreakdown: Array<{
		categoryId: string | null;
		categoryName: string;
		total: number;
		color: string | null;
	}>;
	sixMonthTrend: Array<{
		month: string; // 'YYYY-MM'
		income: number;
		expense: number;
	}>;
}

// --- Sync Protocol Payloads ---

export type SyncEntityTable = 'wallets' | 'categories' | 'transactions';
export type SyncOperation = 'UPSERT' | 'DELETE';

export interface SyncPushMutation<T = Record<string, unknown>> {
	entityId: string;
	table: SyncEntityTable;
	op: SyncOperation;
	hlc: string;
	payload: T;
}

export interface SyncRequestPayload {
	cursor: number; // last known serverUpdatedAt watermark
	mutations: SyncPushMutation[];
}

export interface SyncResponsePayload {
	newCursor: number;
	appliedCount: number;
	delta: {
		wallets: WalletDTO[];
		categories: CategoryDTO[];
		transactions: TransactionDTO[];
	};
}
