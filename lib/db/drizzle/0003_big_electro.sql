CREATE TYPE "public"."payment_review_status" AS ENUM('none', 'refund_required', 'refund_processing', 'refunded', 'reconciliation_required');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('credit', 'debit', 'reward', 'cashback', 'referral_bonus', 'refund', 'refund_reversal', 'reward_reversal', 'wallet_redemption', 'manual_adjustment', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('pending', 'credited', 'reversed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_report_type" AS ENUM('orphan_payment_no_reservation', 'orphan_reservation_no_participant', 'orphan_participant_no_payout', 'orphan_payout_no_payment', 'refund_without_reversal', 'capture_mismatch', 'duplicate_webhook_attempt', 'settlement_batch_failure', 'late_webhook_refund_required', 'stale_pending_payment', 'ledger_wallet_imbalance', 'ledger_razorpay_imbalance');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('asset_cash_razorpay', 'asset_cash_bank', 'liability_user_wallet', 'liability_host_payout', 'liability_venue_payout', 'revenue_platform_fees', 'revenue_host_fees', 'expense_payment_gateway', 'expense_cashback_rewards', 'equity_retained_earnings');--> statement-breakpoint
CREATE TYPE "public"."fraud_flag_entity_type" AS ENUM('user', 'match', 'payout', 'referral');--> statement-breakpoint
CREATE TYPE "public"."fraud_flag_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."fraud_flag_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."attendance_role" AS ENUM('host', 'player');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processing', 'gateway_processing', 'wallet_completed', 'gateway_completed', 'partial_completed', 'failed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified', 'credited', 'reversed', 'expired', 'pending_review');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'payment_initiated' BEFORE 'success';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'payment_authorized' BEFORE 'success';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'payment_captured' BEFORE 'success';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'verified' BEFORE 'success';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'expired' BEFORE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'partially_refunded';--> statement-breakpoint
ALTER TYPE "public"."payment_type" ADD VALUE 'match_join' BEFORE 'refund';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'fully_paid' BEFORE 'funded';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'completed' BEFORE 'funded';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'pending_verification';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'disputed';--> statement-breakpoint
ALTER TYPE "public"."match_status" ADD VALUE 'risk_hold';--> statement-breakpoint
ALTER TYPE "public"."participant_status" ADD VALUE 'joined';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'batched' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'processing' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'ready_for_settlement';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'risk_hold';--> statement-breakpoint
ALTER TYPE "public"."dispatch_channel" ADD VALUE 'email';--> statement-breakpoint
ALTER TYPE "public"."dispatch_status" ADD VALUE 'exhausted';--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_webhook_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "hosted_match_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_order_id" text,
	"payment_id" uuid,
	"reservation_status" text DEFAULT 'pending_payment' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp NOT NULL,
	"converted_participant_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" "reconciliation_report_type" NOT NULL,
	"severity" "reconciliation_severity" DEFAULT 'medium' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"source_system" text DEFAULT 'reconciliation_cron' NOT NULL,
	"payload" jsonb NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"auto_resolved" boolean DEFAULT false NOT NULL,
	"resolution_notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" "ledger_account" NOT NULL,
	"entity_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"type" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_quality_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query" text,
	"filters" jsonb DEFAULT '{}'::jsonb,
	"results_count" numeric,
	"top_result_ids" jsonb DEFAULT '[]'::jsonb,
	"clicked_entity_id" uuid,
	"clicked_position" numeric,
	"converted_at" timestamp,
	"algo_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_replays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_job_id" text NOT NULL,
	"queue_name" text NOT NULL,
	"replayed_by" uuid NOT NULL,
	"replay_reason" text NOT NULL,
	"replayed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"ip_hash" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_presence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"concurrent_viewers" integer DEFAULT 0 NOT NULL,
	"active_watchers" integer DEFAULT 0 NOT NULL,
	"join_velocity" integer DEFAULT 0 NOT NULL,
	"snapshot_ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_abuse_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"ip_hash" text NOT NULL,
	"user_agent_hash" text,
	"fingerprint_hash" text,
	"geohash" text,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"search_type" text NOT NULL,
	"geohash_bucket" text NOT NULL,
	"sport" text,
	"radius_km" integer NOT NULL,
	"results_count" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"cache_hit" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cron_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"job_key" text NOT NULL,
	"trigger_source" text DEFAULT 'cron' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "distributed_locks" (
	"resource_id" text PRIMARY KEY NOT NULL,
	"lock_version" bigint DEFAULT 0 NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "fraud_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "fraud_flag_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"severity" "fraud_flag_severity" NOT NULL,
	"reason" text NOT NULL,
	"score" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "fraud_flag_status" DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coordinates" "geography(Point, 4326)" NOT NULL,
	"geohash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_locations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" text NOT NULL,
	"job_type" text NOT NULL,
	"bullmq_job_id" text,
	"reference_id" text,
	"attempts" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_attendance_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"participant_id" uuid,
	"user_id" uuid NOT NULL,
	"role" "attendance_role" NOT NULL,
	"status" "attendance_status" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"refund_mode" text NOT NULL,
	"gateway_refund_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"wallet_refund_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"provider_response" jsonb DEFAULT '{}'::jsonb,
	"failure_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"referral_code" text NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"reward_amount" numeric(12, 2) DEFAULT '100' NOT NULL,
	"qualified_at" timestamp,
	"credited_at" timestamp,
	"reversed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"identity_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_reference" text NOT NULL,
	"status" text NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_payouts" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"processed_at" timestamp,
	"settled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_batches_batch_reference_unique" UNIQUE("batch_reference")
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'payment_pending'::text;--> statement-breakpoint
DROP TYPE "public"."booking_status";--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'reserving_slot', 'payment_pending', 'confirmed', 'cancel_pending', 'cancelled', 'completed', 'disputed', 'risk_hold', 'expired');--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'payment_pending'::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE "public"."booking_status" USING "status"::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "reward_events" ALTER COLUMN "event_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."reward_event_type";--> statement-breakpoint
CREATE TYPE "public"."reward_event_type" AS ENUM('signup_bonus', 'referral_referrer', 'referral_referee', 'first_booking_cashback', 'underfill_refund', 'cancellation_refund', 'admin_credit', 'admin_debit', 'host_milestone_reward', 'first_match_cashback', 'milestone_reward', 'referral_reward', 'host_bonus', 'manual_reward');--> statement-breakpoint
ALTER TABLE "reward_events" ALTER COLUMN "event_type" SET DATA TYPE "public"."reward_event_type" USING "event_type"::"public"."reward_event_type";--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "reason" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "wallet_ledger" ALTER COLUMN "balance_after" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "reward_events" ALTER COLUMN "amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "coordinates" "geography(Point, 4326)";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "review_status" "payment_review_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "verification_deadline" timestamp;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "settlement_releases_at" timestamp;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD COLUMN "coordinates" "geography(Point, 4326)";--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "balance_before" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "transaction_type" "wallet_transaction_type";--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "reference_type" text;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "venue_payout_ledger" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "venue_payout_ledger" ADD COLUMN "payout_type" text;--> statement-breakpoint
ALTER TABLE "venue_payout_ledger" ADD COLUMN "settlement_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "status" "reward_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "reversed_at" timestamp;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "reward_events" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_revenue_ledger" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_revenue_ledger" ADD COLUMN "revenue_type" text;--> statement-breakpoint
ALTER TABLE "notification_dispatch_logs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_dispatch_logs" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "notification_dispatch_logs" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "notification_dispatch_logs" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_dispatch_logs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "hosted_match_reservations" ADD CONSTRAINT "hosted_match_reservations_match_id_hosted_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."hosted_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_match_reservations" ADD CONSTRAINT "hosted_match_reservations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_match_reservations" ADD CONSTRAINT "hosted_match_reservations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_match_reservations" ADD CONSTRAINT "hosted_match_reservations_converted_participant_id_hosted_match_participants_id_fk" FOREIGN KEY ("converted_participant_id") REFERENCES "public"."hosted_match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_quality_events" ADD CONSTRAINT "search_quality_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_replays" ADD CONSTRAINT "queue_replays_replayed_by_profiles_id_fk" FOREIGN KEY ("replayed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_profiles_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_abuse_events" ADD CONSTRAINT "search_abuse_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_analytics" ADD CONSTRAINT "search_analytics_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_attendance_confirmations" ADD CONSTRAINT "match_attendance_confirmations_match_id_hosted_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."hosted_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_attendance_confirmations" ADD CONSTRAINT "match_attendance_confirmations_participant_id_hosted_match_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."hosted_match_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_attendance_confirmations" ADD CONSTRAINT "match_attendance_confirmations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_profiles_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_profiles_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_unique_active_reservation" ON "hosted_match_reservations" USING btree ("user_id","match_id") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "idx_financial_ledger_transaction" ON "financial_ledger" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_financial_ledger_account" ON "financial_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_financial_ledger_reference" ON "financial_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_financial_ledger_entity" ON "financial_ledger" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referrals_referred_user" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE INDEX "idx_referrals_code" ON "referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "idx_referrals_referrer" ON "referrals" USING btree ("referrer_user_id");--> statement-breakpoint
ALTER TABLE "venue_payout_ledger" ADD CONSTRAINT "venue_payout_ledger_settlement_batch_id_settlement_batches_id_fk" FOREIGN KEY ("settlement_batch_id") REFERENCES "public"."settlement_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_coordinates_idx" ON "venues" USING gist ("coordinates");--> statement-breakpoint
CREATE INDEX "hosted_matches_coordinates_idx" ON "hosted_matches" USING gist ("coordinates");--> statement-breakpoint
CREATE INDEX "idx_wallet_ledger_user_created" ON "wallet_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_wallet_ledger_reference" ON "wallet_ledger" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reward_events_dedup" ON "reward_events" USING btree ("user_id","event_type","reference_id") WHERE "reward_events"."reference_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_reward_events_status" ON "reward_events" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "wallet_balance_check" CHECK ("profiles"."wallet_balance" >= 0);