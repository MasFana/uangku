import { sqliteTable, text, integer, index, unique, primaryKey } from 'drizzle-orm/sqlite-core';

// --- Better-Auth Tables (D1 SQLite schema) ---

export const users = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const sessions = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('session_user_idx').on(table.userId)]
);

export const accounts = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
		scope: text('scope'),
		idToken: text('id_token'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('account_user_idx').on(table.userId)]
);

export const verifications = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
	},
	(table) => [index('verification_ident_idx').on(table.identifier)]
);

// --- Core Domain Tables ---

export const walletTypes = ['cash', 'bank', 'ewallet', 'other'] as const;
export type WalletType = (typeof walletTypes)[number];

export const wallets = sqliteTable(
	'wallets',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		type: text('type', { enum: walletTypes }).notNull(),
		initialBalance: integer('initial_balance').notNull().default(0),
		currentBalance: integer('current_balance').notNull().default(0),
		icon: text('icon'),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		hlc: text('hlc').notNull().default(''),
		serverUpdatedAt: integer('server_updated_at').notNull().default(0),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		index('wallets_user_idx').on(table.userId),
		index('idx_wallets_sync').on(table.userId, table.serverUpdatedAt, table.id),
		unique('wallets_user_name_unique').on(table.userId, table.name)
	]
);

export const categoryKinds = ['expense', 'income'] as const;
export type CategoryKind = (typeof categoryKinds)[number];

export const categories = sqliteTable(
	'categories',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: text('kind', { enum: categoryKinds }).notNull(),
		icon: text('icon'),
		color: text('color'),
		archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
		hlc: text('hlc').notNull().default(''),
		serverUpdatedAt: integer('server_updated_at').notNull().default(0),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		index('categories_user_idx').on(table.userId),
		index('idx_categories_sync').on(table.userId, table.serverUpdatedAt, table.id),
		unique('categories_user_name_kind_unique').on(table.userId, table.name, table.kind)
	]
);

export const transactionTypes = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const transactions = sqliteTable(
	'transactions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		walletId: text('wallet_id')
			.notNull()
			.references(() => wallets.id, { onDelete: 'restrict' }),
		categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
		type: text('type', { enum: transactionTypes }).notNull(),
		amount: integer('amount').notNull(),
		transferWalletId: text('transfer_wallet_id').references(() => wallets.id, {
			onDelete: 'restrict'
		}),
		note: text('note'),
		occurredAt: text('occurred_at').notNull(),
		receiptKey: text('receipt_key'),
		hlc: text('hlc').notNull().default(''),
		serverUpdatedAt: integer('server_updated_at').notNull().default(0),
		deletedAt: text('deleted_at'),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		index('tx_user_occurred_covering_idx').on(
			table.userId,
			table.occurredAt,
			table.id,
			table.type,
			table.amount,
			table.categoryId
		),
		index('tx_user_category_occurred_idx').on(table.userId, table.categoryId, table.occurredAt),
		index('tx_user_wallet_occurred_idx').on(table.userId, table.walletId, table.occurredAt),
		index('idx_transactions_sync').on(table.userId, table.serverUpdatedAt, table.id)
	]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Verification = typeof verifications.$inferSelect;

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;