CREATE TYPE "public"."slot_status" AS ENUM('available', 'held', 'booked', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'success', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('booking', 'host_commitment', 'match_reserve', 'match_final', 'refund', 'cashback');--> statement-breakpoint
CREATE TYPE "public"."match_financial_status" AS ENUM('pending', 'partially_funded', 'funded');--> statement-breakpoint
CREATE TYPE "public"."match_skill_level" AS ENUM('beginner', 'intermediate', 'advanced', 'any');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('open', 'confirmed', 'funded', 'cancelled', 'expired', 'cancelled_underfilled');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('reserved', 'final_paid', 'cancelled', 'dropped_unpaid');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('payment_success', 'match_joined', 'match_confirmed', 'final_payment_pending', 'booking_reminder', 'match_cancelled', 'badge_earned', 'match_almost_full', 'final_payment_due', 'wallet_refund_credited', 'player_dropped_unpaid', 'match_reopened');--> statement-breakpoint
CREATE TYPE "public"."owner_lead_status" AS ENUM('new', 'contacted', 'demo', 'onboarded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('flat', 'percent');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'paid', 'hold');--> statement-breakpoint
CREATE TYPE "public"."reward_event_type" AS ENUM('signup_bonus', 'referral_referrer', 'referral_referee', 'first_booking_cashback', 'first_match_cashback', 'underfill_refund', 'cancellation_refund', 'admin_credit', 'admin_debit');--> statement-breakpoint
CREATE TYPE "public"."community_post_type" AS ENUM('text', 'image', 'looking_players', 'match_result', 'challenge', 'venue_review', 'achievement');--> statement-breakpoint
CREATE TYPE "public"."squad_challenge_status" AS ENUM('pending', 'accepted', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."squad_member_role" AS ENUM('captain', 'member');--> statement-breakpoint
CREATE TYPE "public"."test_invite_status" AS ENUM('sent', 'used', 'expired');--> statement-breakpoint
CREATE TYPE "public"."dispatch_channel" AS ENUM('in_app', 'whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'reviewed', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('user', 'post', 'squad', 'chat');--> statement-breakpoint
CREATE TYPE "public"."strike_type" AS ENUM('spam', 'drop_abuse', 'referral_abuse', 'no_show', 'report');--> statement-breakpoint
CREATE TABLE "city_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_name" text NOT NULL,
	"slug" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"launch_priority" integer DEFAULT 99 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "city_master_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"favorite_sports" text[] DEFAULT '{}' NOT NULL,
	"avatar_url" text,
	"wallet_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"wallet_auto_use" boolean DEFAULT false NOT NULL,
	"badge_count" integer DEFAULT 0 NOT NULL,
	"trust_score" numeric(5, 2) DEFAULT '100' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"referral_code" text,
	"referred_by" text,
	"signup_bonus_paid" boolean DEFAULT false NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"preferred_areas" text[] DEFAULT '{}' NOT NULL,
	"primary_skill_level" text,
	"strike_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "profiles_email_unique" UNIQUE("email"),
	CONSTRAINT "profiles_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"city_id" uuid,
	"address" text NOT NULL,
	"sports" text[] DEFAULT '{}' NOT NULL,
	"price_per_hour" numeric(10, 2) NOT NULL,
	"weekday_morning_price" integer DEFAULT 0 NOT NULL,
	"weekday_day_price" integer DEFAULT 0 NOT NULL,
	"weekday_evening_price" integer DEFAULT 0 NOT NULL,
	"weekend_price" integer DEFAULT 0 NOT NULL,
	"slot_interval_mins" integer DEFAULT 60 NOT NULL,
	"cover_image" text,
	"images" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"open_time" text DEFAULT '06:00' NOT NULL,
	"close_time" text DEFAULT '23:00' NOT NULL,
	"contact_phone" text,
	"owner_name" text,
	"owner_user_id" uuid,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"rating" numeric(3, 2) DEFAULT '4.5' NOT NULL,
	"total_reviews" integer DEFAULT 0 NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"price_override" numeric(10, 2),
	"status" "slot_status" DEFAULT 'available' NOT NULL,
	"sport" text,
	"is_blocked_by_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"sport" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_id" uuid,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"duration_hours" integer,
	"slot_count" integer,
	"member_price" integer,
	"wallet_credit_earned" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "payment_type" NOT NULL,
	"reference_id" uuid,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"razorpay_signature" text,
	"amount" numeric(10, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"sport" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"total_players" integer NOT NULL,
	"min_players" integer NOT NULL,
	"current_players" integer DEFAULT 0 NOT NULL,
	"skill_level" "match_skill_level" DEFAULT 'any' NOT NULL,
	"host_fee" numeric(10, 2) DEFAULT '99' NOT NULL,
	"reserve_fee" numeric(10, 2) NOT NULL,
	"final_fee_per_player" numeric(10, 2) NOT NULL,
	"total_venue_cost" numeric(10, 2) NOT NULL,
	"notes" text,
	"city_id" uuid,
	"status" "match_status" DEFAULT 'open' NOT NULL,
	"financial_status" "match_financial_status" DEFAULT 'pending' NOT NULL,
	"host_payment_id" uuid,
	"lock_deadline" timestamp,
	"cancelled_reason" text,
	"underfill_refund_issued" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_match_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "participant_status" DEFAULT 'reserved' NOT NULL,
	"reserve_payment_id" uuid,
	"final_payment_id" uuid,
	"final_payment_deadline" timestamp,
	"dropped_at" timestamp,
	"dropped_reason" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "ledger_type" NOT NULL,
	"reason" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"sports" text[] DEFAULT '{}' NOT NULL,
	"message" text,
	"status" "owner_lead_status" DEFAULT 'new' NOT NULL,
	"contacted_on" timestamp,
	"followup_date" date,
	"notes" text,
	"assigned_admin" text,
	"expected_inventory_value" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"min_amount" numeric(10, 2),
	"first_booking_only" boolean DEFAULT false NOT NULL,
	"city_slug" text,
	"sport" text,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "venue_payout_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"reference_id" uuid,
	"reference_type" text NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"razorpay_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"platform_commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"venue_payable" numeric(10, 2) NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "reward_event_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"completed_bookings" integer DEFAULT 0 NOT NULL,
	"cancelled_bookings" integer DEFAULT 0 NOT NULL,
	"total_hosted_matches" integer DEFAULT 0 NOT NULL,
	"completed_hosted_matches" integer DEFAULT 0 NOT NULL,
	"total_matches_joined" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"reliability_score" numeric(5, 2) DEFAULT '100' NOT NULL,
	"total_spent" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "platform_revenue_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_type" text NOT NULL,
	"gross_amount" numeric(10, 2) NOT NULL,
	"gateway_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(10, 2) NOT NULL,
	"net_revenue" numeric(10, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"city_id" uuid,
	"type" "community_post_type" DEFAULT 'text' NOT NULL,
	"caption" text NOT NULL,
	"image_url" text,
	"related_match_id" uuid,
	"related_venue_id" uuid,
	"related_squad_id" uuid,
	"sport" text,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_post_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_squad_id" uuid NOT NULL,
	"opponent_squad_id" uuid NOT NULL,
	"proposed_date" text NOT NULL,
	"proposed_slot_id" uuid,
	"sport" text NOT NULL,
	"status" "squad_challenge_status" DEFAULT 'pending' NOT NULL,
	"hosted_match_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "squad_member_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"squad_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"city_id" uuid,
	"sport" text NOT NULL,
	"captain_user_id" uuid NOT NULL,
	"description" text,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"trust_rating" numeric(4, 2) DEFAULT '4.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_user_id" uuid NOT NULL,
	"following_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"invite_code" text NOT NULL,
	"status" "test_invite_status" DEFAULT 'sent' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "notification_dispatch_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_id" uuid,
	"channel" "dispatch_channel" NOT NULL,
	"destination" text NOT NULL,
	"template_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "dispatch_status" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" "report_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "strike_type" NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_city_id_city_master_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD CONSTRAINT "hosted_matches_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD CONSTRAINT "hosted_matches_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD CONSTRAINT "hosted_matches_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_matches" ADD CONSTRAINT "hosted_matches_city_id_city_master_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."city_master"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_match_participants" ADD CONSTRAINT "hosted_match_participants_match_id_hosted_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."hosted_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_match_participants" ADD CONSTRAINT "hosted_match_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_ledger" ADD CONSTRAINT "wallet_ledger_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_payout_ledger" ADD CONSTRAINT "venue_payout_ledger_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;