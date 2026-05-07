-- Set initial balance of 1000 for existing users who have balance = 0.
-- Safe because balance deduction was not implemented before this migration;
-- every user with balance = 0 was created with the old default and has
-- never had funds deducted.
UPDATE "users" SET "balance" = 1000 WHERE "balance" = 0;
