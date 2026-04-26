CREATE TYPE "public"."wtf_subdomain_grant_status" AS ENUM('reserved', 'pending', 'provisioned', 'revoked');--> statement-breakpoint
CREATE TABLE "wtf_subdomain_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" varchar(63) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"parent_domain" varchar(255) DEFAULT 'wtf.tez' NOT NULL,
	"status" "wtf_subdomain_grant_status" DEFAULT 'reserved' NOT NULL,
	"wallet_address" varchar(36),
	"source_type" varchar(40) DEFAULT 'admin' NOT NULL,
	"source_id" integer,
	"granted_by" integer,
	"notes" text,
	"op_hash" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"provisioned_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_wtf_subdomain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "reward_wtf_subdomain_label_template" varchar(120);--> statement-breakpoint
ALTER TABLE "side_quests" ADD COLUMN "reward_wtf_subdomain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "side_quests" ADD COLUMN "reward_wtf_subdomain_label_template" varchar(120);--> statement-breakpoint
ALTER TABLE "wtf_subdomain_grants" ADD CONSTRAINT "wtf_subdomain_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wtf_subdomain_grants" ADD CONSTRAINT "wtf_subdomain_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wtf_subdomain_grants_label_unique" ON "wtf_subdomain_grants" USING btree ("parent_domain","label");--> statement-breakpoint
CREATE UNIQUE INDEX "wtf_subdomain_grants_full_name_unique" ON "wtf_subdomain_grants" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "wtf_subdomain_grants_user_idx" ON "wtf_subdomain_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wtf_subdomain_grants_status_idx" ON "wtf_subdomain_grants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wtf_subdomain_grants_source_idx" ON "wtf_subdomain_grants" USING btree ("source_type","source_id");
