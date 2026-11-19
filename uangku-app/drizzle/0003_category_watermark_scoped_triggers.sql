-- Migration 0003: Category sync watermark (hlc + server_updated_at) and user-scoped wallet triggers
--
-- ponytail: balances are NOT delta-visible. These triggers still do not bump `wallets.server_updated_at`,
-- so a trigger-driven `current_balance` change is never re-delivered over the sync cursor; the client
-- derives balances locally from transactions instead. Ceiling: upgrade by bumping `wallets.server_updated_at`
-- inside each wallet UPDATE once the delta no longer carries derivable transactions.

-- 1. Backfill existing categories so they become delta-visible (server_updated_at > 0).
UPDATE `categories` SET `server_updated_at` = 1795067520208 WHERE `server_updated_at` = 0;
--> statement-breakpoint
UPDATE `categories` SET `hlc` = '000000000-0000-backfill' WHERE `hlc` = '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_categories_user_server_updated` ON `categories` (`user_id`, `server_updated_at`);
--> statement-breakpoint
-- 2. Recreate wallet-mutating triggers with user scoping (same names; no other code changes).
DROP TRIGGER IF EXISTS `trg_sync_tx_insert`;
--> statement-breakpoint
CREATE TRIGGER `trg_sync_tx_insert`
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
	WHERE `id` = NEW.wallet_id AND `user_id` = NEW.user_id;

	-- 2. Update transfer target wallet balance if transfer
	UPDATE `wallets`
	SET `current_balance` = `current_balance` + NEW.amount
	WHERE NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL AND `id` = NEW.transfer_wallet_id AND `user_id` = NEW.user_id;

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
DROP TRIGGER IF EXISTS `trg_sync_tx_update`;
--> statement-breakpoint
CREATE TRIGGER `trg_sync_tx_update`
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
	WHERE OLD.deleted_at IS NULL AND `id` = OLD.wallet_id AND `user_id` = OLD.user_id;

	UPDATE `wallets`
	SET `current_balance` = `current_balance` - OLD.amount
	WHERE OLD.deleted_at IS NULL AND OLD.type = 'transfer' AND OLD.transfer_wallet_id IS NOT NULL AND `id` = OLD.transfer_wallet_id AND `user_id` = OLD.user_id;

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
	WHERE NEW.deleted_at IS NULL AND `id` = NEW.wallet_id AND `user_id` = NEW.user_id;

	UPDATE `wallets`
	SET `current_balance` = `current_balance` + NEW.amount
	WHERE NEW.deleted_at IS NULL AND NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL AND `id` = NEW.transfer_wallet_id AND `user_id` = NEW.user_id;

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
