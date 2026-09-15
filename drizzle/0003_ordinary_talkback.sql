CREATE TABLE `audio_queue_lock` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text DEFAULT '' NOT NULL,
	`until` integer DEFAULT 0 NOT NULL,
	`blocked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audio_quota_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`seconds` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audio_quota_time` ON `audio_quota_events` (`created`);--> statement-breakpoint
CREATE TABLE `audio_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`ordinal` integer NOT NULL,
	`key` text NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`offset_ms` integer NOT NULL,
	`state` text DEFAULT 'missing' NOT NULL,
	`result` text,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audio_segments_task` ON `audio_segments` (`task`,`ordinal`);--> statement-breakpoint
CREATE TABLE `audio_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`manifest` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`next_attempt` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audio_tasks_owner_due` ON `audio_tasks` (`owner`,`next_attempt`);