ALTER TABLE "owner_leads" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "owner_leads" ALTER COLUMN "status" SET DEFAULT 'new'::text;--> statement-breakpoint
DROP TYPE "public"."owner_lead_status";--> statement-breakpoint
CREATE TYPE "public"."owner_lead_status" AS ENUM('new', 'qualified', 'onboarded', 'rejected', 'contacted', 'demo');--> statement-breakpoint
ALTER TABLE "owner_leads" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."owner_lead_status";--> statement-breakpoint
ALTER TABLE "owner_leads" ALTER COLUMN "status" SET DATA TYPE "public"."owner_lead_status" USING "status"::"public"."owner_lead_status";--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "is_onboarding_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_leads" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "owner_leads" ADD CONSTRAINT "owner_leads_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;