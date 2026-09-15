CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`recording` text NOT NULL,
	`ordinal` integer NOT NULL,
	`offset` integer NOT NULL,
	`state` text NOT NULL,
	`key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chunks_recording` ON `chunks` (`recording`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`recording` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_recording_kind` ON `documents` (`recording`,`kind`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`parts` integer NOT NULL,
	`uploaded` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recordings_owner_created` ON `recordings` (`owner`,`created`);