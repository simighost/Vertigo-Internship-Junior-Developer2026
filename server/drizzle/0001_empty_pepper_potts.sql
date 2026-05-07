ALTER TABLE `markets` ADD `payout_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `balance` real DEFAULT 0 NOT NULL;