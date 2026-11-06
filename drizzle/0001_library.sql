CREATE TABLE `ai_import` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ok` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `day_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day_plan_id` integer NOT NULL,
	`slot` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`meal_id` integer,
	`food_id` integer,
	`amount` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`day_plan_id`) REFERENCES `day_plan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `day_entry_plan_idx` ON `day_entry` (`day_plan_id`);--> statement-breakpoint
CREATE TABLE `day_plan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`date` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `food` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_by_user_id` integer,
	`name` text NOT NULL,
	`unit` text DEFAULT 'g' NOT NULL,
	`default_amount` real DEFAULT 100 NOT NULL,
	`kcal_per_100` real DEFAULT 0 NOT NULL,
	`protein_per_100` real DEFAULT 0 NOT NULL,
	`fibre_per_100` real DEFAULT 0 NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meal_ingredient` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text DEFAULT 'whole' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`kcal` real,
	`protein_g` real,
	`fibre_g` real,
	FOREIGN KEY (`meal_id`) REFERENCES `meal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_ingredient_meal_idx` ON `meal_ingredient` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_by_user_id` integer,
	`name` text NOT NULL,
	`slot` text DEFAULT 'dinner' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`servings_in_recipe` real DEFAULT 1 NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`kcal` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`fibre_g` real DEFAULT 0 NOT NULL,
	`nutrition_status` text DEFAULT 'manual' NOT NULL,
	`assumptions` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `meal_slot_idx` ON `meal` (`slot`);--> statement-breakpoint
CREATE TABLE `pantry_staple` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pantry_staple_user_idx` ON `pantry_staple` (`user_id`);--> statement-breakpoint
CREATE TABLE `shopping_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`is_staple` integer DEFAULT false NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_list`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shopping_item_list_idx` ON `shopping_item` (`list_id`);--> statement-breakpoint
CREATE TABLE `shopping_list` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`people` real DEFAULT 2 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
