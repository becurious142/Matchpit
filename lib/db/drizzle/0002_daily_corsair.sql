ALTER TABLE "hosted_matches" ALTER COLUMN "total_venue_cost" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_category" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gross_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "host_fee_component" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reserve_fee_component" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "final_fee_component" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "wallet_component" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_component" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "gross_host_collected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "gross_reserve_collected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "gross_final_collected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "total_collected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "platform_fee_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "refund_exposure" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_match_participants" ADD COLUMN "reserve_paid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_match_participants" ADD COLUMN "final_paid_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_match_participants" ADD COLUMN "payment_status" text DEFAULT 'none' NOT NULL;