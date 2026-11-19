-- 0005: drop a trigger that exists only in the deployed database.
--
-- `trg_sync_tx_delete` is in no migration file: it was created by an older draft of
-- 0002 and survived the 0003/0004 rewrites. Its body still updates `daily_rollups`
-- and `monthly_rollups`, which 0004 dropped, so any hard DELETE on `transactions`
-- would now abort with "no such table".
--
-- The app never hard-deletes transactions: a DELETE mutation is a soft-delete
-- UPDATE (`deleted_at`), reverted by `trg_sync_tx_update`. The trigger has no job.

DROP TRIGGER IF EXISTS `trg_sync_tx_delete`;