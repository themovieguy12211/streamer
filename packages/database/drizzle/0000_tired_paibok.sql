CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."ad_event_type" AS ENUM('REQUEST', 'IMPRESSION', 'START', 'COMPLETE', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('MOVIE', 'EPISODE');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."video_event_type" AS ENUM('START', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'COMPLETE', 'ERROR', 'QUALITY_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('DRAFT', 'UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PRIVATE', 'UNLISTED', 'PUBLIC');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"session_id" varchar(36),
	"event_type" "ad_event_type" NOT NULL,
	"ad_duration_seconds" integer,
	"revenue_micros" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"image_key" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "encoding_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"bull_job_id" varchar(128),
	"state" "job_state" DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"stage" varchar(64),
	"rendition" varchar(16),
	"speed" varchar(32),
	"elapsed_seconds" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"series_id" varchar(36) NOT NULL,
	"season_number" integer NOT NULL,
	"title" varchar(255),
	"tmdb_id" integer,
	"poster_path" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"description" text,
	"tmdb_id" integer,
	"poster_path" varchar(512),
	"backdrop_path" varchar(512),
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"provider" varchar(32) DEFAULT 'crypto' NOT NULL,
	"provider_subscription_id" varchar(255) NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subtitles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"language" varchar(16) NOT NULL,
	"label" varchar(64) NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_key" varchar(512),
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"account_status" "account_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"session_id" varchar(36),
	"event_type" "video_event_type" NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_renditions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"height" integer NOT NULL,
	"bandwidth" integer NOT NULL,
	"playlist_key" varchar(512) NOT NULL,
	"codec" varchar(64) DEFAULT 'h264' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_sources" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"object_key" varchar(512) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_tags" (
	"video_id" varchar(36) NOT NULL,
	"tag_id" varchar(36) NOT NULL,
	CONSTRAINT "video_tags_video_id_tag_id_pk" PRIMARY KEY("video_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videos" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(280) NOT NULL,
	"description" text,
	"content_type" "content_type" DEFAULT 'MOVIE' NOT NULL,
	"season_id" varchar(36),
	"episode_number" integer,
	"tmdb_id" integer,
	"thumbnail_key" varchar(512),
	"backdrop_key" varchar(512),
	"duration_seconds" integer,
	"category_id" varchar(36),
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"age_rating" varchar(20),
	"release_date" timestamp with time zone,
	"visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"status" "video_status" DEFAULT 'DRAFT' NOT NULL,
	"hls_master_key" varchar(512),
	"external_hls_url" varchar(2048),
	"encoding_progress" integer DEFAULT 0 NOT NULL,
	"encoding_stage" varchar(64),
	"encoding_error" text,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watch_history" (
	"user_id" varchar(36) NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"last_watched_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_history_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlists" (
	"user_id" varchar(36) NOT NULL,
	"video_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlists_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_events_video_time_idx" ON "ad_events" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "encoding_jobs_video_idx" ON "encoding_jobs" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "series_season_uq" ON "seasons" USING btree ("series_id","season_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_series_idx" ON "seasons" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "series_slug_uq" ON "series" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "series_tmdb_uq" ON "series" USING btree ("tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_uq" ON "subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subtitles_video_idx" ON "subtitles" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_uq" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_events_video_time_idx" ON "video_events" USING btree ("video_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "renditions_video_idx" ON "video_renditions" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_video_idx" ON "video_sources" USING btree ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videos_slug_uq" ON "videos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_tmdb_idx" ON "videos" USING btree ("tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videos_season_episode_uq" ON "videos" USING btree ("season_id","episode_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_catalogue_idx" ON "videos" USING btree ("status","visibility","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_category_idx" ON "videos" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "history_recent_idx" ON "watch_history" USING btree ("user_id","last_watched_at");