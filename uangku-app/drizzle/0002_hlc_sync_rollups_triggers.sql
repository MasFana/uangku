-- Migration 0002: Add HLC/sync columns, current_balance, materialized rollups and SQLite triggers

-- 1. Add columns to wallets
ALTER TABLE `wallets` ADD COLUMN `current_balance` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `wallets` ADD COLUMN `hlc` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `wallets` ADD COLUMN `server_updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `wallets` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wallets_sync` ON `wallets` (`user_id`, `server_updated_at`, `id`);

--> statement-breakpoint
-- 2. Add columns to categories
ALTER TABLE `categories` ADD COLUMN `hlc` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `categories` ADD COLUMN `server_updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `categories` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_categories_sync` ON `categories` (`user_id`, `server_updated_at`, `id`);

--> statement-breakpoint
-- 3. Add columns to transactions & update indexes
ALTER TABLE `transactions` ADD COLUMN `hlc` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `server_updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `transactions` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tx_user_occurred_covering_idx` ON `transactions` (`user_id`, `occurred_at`, `id`, `type`, `amount`, `category_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tx_user_category_occurred_idx` ON `transactions` (`user_id`, `category_id`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tx_user_wallet_occurred_idx` ON `transactions` (`user_id`, `wallet_id`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_sync` ON `transactions` (`user_id`, `server_updated_at`, `id`);

--> statement-breakpoint
-- 4. Create Materialized Rollup Tables WITHOUT ROWID
CREATE TABLE IF NOT EXISTS `monthly_rollups` (
	`user_id` text NOT NULL,
	`ym` text NOT NULL,
	`type` text NOT NULL,
	`category_id` text NOT NULL DEFAULT '',
	`wallet_id` text NOT NULL,
	`total_amount` integer NOT NULL DEFAULT 0,
	`tx_count` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`user_id`, `ym`, `type`, `category_id`, `wallet_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_monthly_rollups_user_ym` ON `monthly_rollups` (`user_id`, `ym`);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_rollups` (
	`user_id` text NOT NULL,
	`ymd` text NOT NULL,
	`wallet_id` text NOT NULL,
	`income_amount` integer NOT NULL DEFAULT 0,
	`expense_amount` integer NOT NULL DEFAULT 0,
	`transfer_in_amount` integer NOT NULL DEFAULT 0,
	`transfer_out_amount` integer NOT NULL DEFAULT 0,
	`tx_count` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`user_id`, `ymd`, `wallet_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_daily_rollups_user_ymd` ON `daily_rollups` (`user_id`, `ymd`);

--> statement-breakpoint
-- 5. Backfill existing balances and rollups
UPDATE `wallets`
SET `current_balance` = `initial_balance` + COALESCE((
	SELECT SUM(
		CASE 
			WHEN t.type = 'income' THEN t.amount
			WHEN t.type = 'expense' THEN -t.amount
			WHEN t.type = 'transfer' AND t.wallet_id = wallets.id THEN -t.amount
			WHEN t.type = 'transfer' AND t.transfer_wallet_id = wallets.id THEN t.amount
			ELSE 0
		END
	)
	FROM `transactions` t
	WHERE (t.wallet_id = wallets.id OR t.transfer_wallet_id = wallets.id)
	  AND t.deleted_at IS NULL
), 0);

--> statement-breakpoint
INSERT OR REPLACE INTO `monthly_rollups` (`user_id`, `ym`, `type`, `category_id`, `wallet_id`, `total_amount`, `tx_count`)
SELECT 
	user_id,
	substr(occurred_at, 1, 7) AS ym,
	type,
	COALESCE(category_id, '') AS category_id,
	wallet_id,
	SUM(amount) AS total_amount,
	COUNT(*) AS tx_count
FROM `transactions`
WHERE deleted_at IS NULL
GROUP BY user_id, substr(occurred_at, 1, 7), type, COALESCE(category_id, ''), wallet_id;

--> statement-breakpoint
INSERT OR REPLACE INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
SELECT
	user_id,
	substr(occurred_at, 1, 10) AS ymd,
	wallet_id,
	SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income_amount,
	SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense_amount,
	0 AS transfer_in_amount,
	SUM(CASE WHEN type = 'transfer' THEN amount ELSE 0 END) AS transfer_out_amount,
	COUNT(*) AS tx_count
FROM `transactions`
WHERE deleted_at IS NULL
GROUP BY user_id, substr(occurred_at, 1, 10), wallet_id;

--> statement-breakpoint
-- Backfill transfer_in into daily_rollups
INSERT INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
SELECT
	user_id,
	substr(occurred_at, 1, 10) AS ymd,
	transfer_wallet_id AS wallet_id,
	0 AS income_amount,
	0 AS expense_amount,
	SUM(amount) AS transfer_in_amount,
	0 AS transfer_out_amount,
	0 AS tx_count
FROM `transactions`
WHERE deleted_at IS NULL AND type = 'transfer' AND transfer_wallet_id IS NOT NULL
GROUP BY user_id, substr(occurred_at, 1, 10), transfer_wallet_id
ON CONFLICT(`user_id`, `ymd`, `wallet_id`) DO UPDATE SET
	transfer_in_amount = daily_rollups.transfer_in_amount + excluded.transfer_in_amount;

--> statement-breakpoint
-- 6. ATOMIC TRIGGERS
-- Trigger A: AFTER INSERT ON transactions
CREATE TRIGGER IF NOT EXISTS `trg_sync_tx_insert`
AFTER INSERT ON `transactions`
WHEN NEW.deleted_at IS NULL
BEGIN
	-- 1. Update wallet balance for primary wallet
	UPDATE `wallets`
	SET `current_balance` = `current_balance` + (
		CASE
			WHEN NEW.type = 'income' THEN NEW.amount
			WHEN NEW.type = 'expense' THEN -NEW.amount
			WHEN NEW.type = 'transfer' THEN -NEW.amount
			ELSE 0
		END
	)
	WHERE `id` = NEW.wallet_id;

	-- 2. Update transfer target wallet balance if transfer
	UPDATE `wallets`
	SET `current_balance` = `current_balance` + NEW.amount
	WHERE NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL AND `id` = NEW.transfer_wallet_id;

	-- 3. Update monthly_rollups
	INSERT INTO `monthly_rollups` (`user_id`, `ym`, `type`, `category_id`, `wallet_id`, `total_amount`, `tx_count`)
	VALUES (
		NEW.user_id,
		substr(NEW.occurred_at, 1, 7),
		NEW.type,
		COALESCE(NEW.category_id, ''),
		NEW.wallet_id,
		NEW.amount,
		1
	)
	ON CONFLICT(`user_id`, `ym`, `type`, `category_id`, `wallet_id`) DO UPDATE SET
		`total_amount` = `monthly_rollups`.`total_amount` + excluded.`total_amount`,
		`tx_count` = `monthly_rollups`.`tx_count` + 1;

	-- 4. Update daily_rollups for primary wallet
	INSERT INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
	VALUES (
		NEW.user_id,
		substr(NEW.occurred_at, 1, 10),
		NEW.wallet_id,
		CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END,
		CASE WHEN NEW.type = 'expense' THEN NEW.amount ELSE 0 END,
		0,
		CASE WHEN NEW.type = 'transfer' THEN NEW.amount ELSE 0 END,
		1
	)
	ON CONFLICT(`user_id`, `ymd`, `wallet_id`) DO UPDATE SET
		`income_amount` = `daily_rollups`.`income_amount` + excluded.`income_amount`,
		`expense_amount` = `daily_rollups`.`expense_amount` + excluded.`expense_amount`,
		`transfer_out_amount` = `daily_rollups`.`transfer_out_amount` + excluded.`transfer_out_amount`,
		`tx_count` = `daily_rollups`.`tx_count` + 1;

	-- 5. Update daily_rollups for transfer destination wallet
	INSERT INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
	SELECT
		NEW.user_id,
		substr(NEW.occurred_at, 1, 10),
		NEW.transfer_wallet_id,
		0,
		0,
		NEW.amount,
		0,
		0
	WHERE NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL
	ON CONFLICT(`user_id`, `ymd`, `wallet_id`) DO UPDATE SET
		`transfer_in_amount` = `daily_rollups`.`transfer_in_amount` + excluded.`transfer_in_amount`;
END;

--> statement-breakpoint
-- Trigger B: AFTER UPDATE ON transactions
CREATE TRIGGER IF NOT EXISTS `trg_sync_tx_update`
AFTER UPDATE ON `transactions`
WHEN OLD.hlc != NEW.hlc
BEGIN
	-- Revert OLD effect if it was active
	UPDATE `wallets`
	SET `current_balance` = `current_balance` - (
		CASE
			WHEN OLD.type = 'income' THEN OLD.amount
			WHEN OLD.type = 'expense' THEN -OLD.amount
			WHEN OLD.type = 'transfer' THEN -OLD.amount
			ELSE 0
		END
	)
	WHERE OLD.deleted_at IS NULL AND `id` = OLD.wallet_id;

	UPDATE `wallets`
	SET `current_balance` = `current_balance` - OLD.amount
	WHERE OLD.deleted_at IS NULL AND OLD.type = 'transfer' AND OLD.transfer_wallet_id IS NOT NULL AND `id` = OLD.transfer_wallet_id;

	-- Revert OLD monthly rollups
	UPDATE `monthly_rollups`
	SET `total_amount` = `total_amount` - OLD.amount,
	    `tx_count` = `tx_count` - 1
	WHERE OLD.deleted_at IS NULL
	  AND `user_id` = OLD.user_id
	  AND `ym` = substr(OLD.occurred_at, 1, 7)
	  AND `type` = OLD.type
	  AND `category_id` = COALESCE(OLD.category_id, '')
	  AND `wallet_id` = OLD.wallet_id;

	-- Revert OLD daily rollups
	UPDATE `daily_rollups`
	SET `income_amount` = `income_amount` - (CASE WHEN OLD.type = 'income' THEN OLD.amount ELSE 0 END),
	    `expense_amount` = `expense_amount` - (CASE WHEN OLD.type = 'expense' THEN OLD.amount ELSE 0 END),
	    `transfer_out_amount` = `transfer_out_amount` - (CASE WHEN OLD.type = 'transfer' THEN OLD.amount ELSE 0 END),
	    `tx_count` = `tx_count` - 1
	WHERE OLD.deleted_at IS NULL
	  AND `user_id` = OLD.user_id
	  AND `ymd` = substr(OLD.occurred_at, 1, 10)
	  AND `wallet_id` = OLD.wallet_id;

	UPDATE `daily_rollups`
	SET `transfer_in_amount` = `transfer_in_amount` - OLD.amount
	WHERE OLD.deleted_at IS NULL
	  AND OLD.type = 'transfer'
	  AND OLD.transfer_wallet_id IS NOT NULL
	  AND `user_id` = OLD.user_id
	  AND `ymd` = substr(OLD.occurred_at, 1, 10)
	  AND `wallet_id` = OLD.transfer_wallet_id;

	-- Apply NEW effect if it is active
	UPDATE `wallets`
	SET `current_balance` = `current_balance` + (
		CASE
			WHEN NEW.type = 'income' THEN NEW.amount
			WHEN NEW.type = 'expense' THEN -NEW.amount
			WHEN NEW.type = 'transfer' THEN -NEW.amount
			ELSE 0
		END
	)
	WHERE NEW.deleted_at IS NULL AND `id` = NEW.wallet_id;

	UPDATE `wallets`
	SET `current_balance` = `current_balance` + NEW.amount
	WHERE NEW.deleted_at IS NULL AND NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL AND `id` = NEW.transfer_wallet_id;

	-- Insert/Update NEW monthly rollups
	INSERT INTO `monthly_rollups` (`user_id`, `ym`, `type`, `category_id`, `wallet_id`, `total_amount`, `tx_count`)
	SELECT
		NEW.user_id,
		substr(NEW.occurred_at, 1, 7),
		NEW.type,
		COALESCE(NEW.category_id, ''),
		NEW.wallet_id,
		NEW.amount,
		1
	WHERE NEW.deleted_at IS NULL
	ON CONFLICT(`user_id`, `ym`, `type`, `category_id`, `wallet_id`) DO UPDATE SET
		`total_amount` = `monthly_rollups`.`total_amount` + excluded.`total_amount`,
		`tx_count` = `monthly_rollups`.`tx_count` + 1;

	-- Insert/Update NEW daily rollups for primary wallet
	INSERT INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
	SELECT
		NEW.user_id,
		substr(NEW.occurred_at, 1, 10),
		NEW.wallet_id,
		CASE WHEN NEW.type = 'income' THEN NEW.amount ELSE 0 END,
		CASE WHEN NEW.type = 'expense' THEN NEW.amount ELSE 0 END,
		0,
		CASE WHEN NEW.type = 'transfer' THEN NEW.amount ELSE 0 END,
		1
	WHERE NEW.deleted_at IS NULL
	ON CONFLICT(`user_id`, `ymd`, `wallet_id`) DO UPDATE SET
		`income_amount` = `daily_rollups`.`income_amount` + excluded.`income_amount`,
		`expense_amount` = `daily_rollups`.`expense_amount` + excluded.`expense_amount`,
		`transfer_out_amount` = `daily_rollups`.`transfer_out_amount` + excluded.`transfer_out_amount`,
		`tx_count` = `daily_rollups`.`tx_count` + 1;

	-- Insert/Update NEW daily rollups for transfer destination wallet
	INSERT INTO `daily_rollups` (`user_id`, `ymd`, `wallet_id`, `income_amount`, `expense_amount`, `transfer_in_amount`, `transfer_out_amount`, `tx_count`)
	SELECT
		NEW.user_id,
		substr(NEW.occurred_at, 1, 10),
		NEW.transfer_wallet_id,
		0,
		0,
		NEW.amount,
		0,
		0
	WHERE NEW.deleted_at IS NULL AND NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL
	ON CONFLICT(`user_id`, `ymd`, `wallet_id`) DO UPDATE SET
		`transfer_in_amount` = `daily_rollups`.`transfer_in_amount` + excluded.`transfer_in_amount`;
END;
