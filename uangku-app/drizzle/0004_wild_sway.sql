-- 0004: drop the unread rollup tables (no code path selects them; analytics are derived
-- client-side in `src/lib/client/derive/**`).
-- Triggers are recreated first, because a live trigger body that still references a
-- dropped table aborts every transaction write. The 0002/0003 bodies also wrote 2-3
-- rollup rows per transaction; those rows now cost nothing against the D1 write quota.
-- ponytail: wallet balance trigger stays (server-internal `current_balance`), ceiling:
-- drop it too once nothing server-side reads `wallets.current_balance`.

DROP TRIGGER IF EXISTS `trg_sync_tx_insert`;--> statement-breakpoint
CREATE TRIGGER `trg_sync_tx_insert` AFTER INSERT ON `transactions`
WHEN NEW.deleted_at IS NULL
BEGIN
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

	UPDATE `wallets`
	SET `current_balance` = `current_balance` + NEW.amount
	WHERE NEW.type = 'transfer' AND NEW.transfer_wallet_id IS NOT NULL AND `id` = NEW.transfer_wallet_id AND `user_id` = NEW.user_id;
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_sync_tx_update`;--> statement-breakpoint
CREATE TRIGGER `trg_sync_tx_update` AFTER UPDATE ON `transactions`
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
END;--> statement-breakpoint
DROP TABLE `daily_rollups`;--> statement-breakpoint
DROP TABLE `monthly_rollups`;