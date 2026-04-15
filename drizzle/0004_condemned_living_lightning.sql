CREATE TABLE "user_notification_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"source_user_id" integer,
	"event_key" varchar(80) NOT NULL,
	"title" varchar(220) NOT NULL,
	"body" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_auth_nonces" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(36) NOT NULL,
	"nonce" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "wallet_address_idx";--> statement-breakpoint
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notification_user_created_idx" ON "user_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_notification_user_read_idx" ON "user_notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "user_notification_event_idx" ON "user_notifications" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_address_unique_idx" ON "user_wallets" USING btree ("wallet_address");