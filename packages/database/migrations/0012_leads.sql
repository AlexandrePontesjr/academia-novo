CREATE TABLE "lead_throttles" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" timestamp with time zone[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"lead_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "lead_verifications_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"consent_purpose" text NOT NULL,
	"consent_term_version" integer NOT NULL,
	"email_verified_at" timestamp with time zone,
	"student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_status_valid" CHECK ("leads"."status" in ('new', 'contacted', 'converted', 'discarded')),
	CONSTRAINT "leads_source_valid" CHECK ("leads"."source" in ('form', 'google')),
	CONSTRAINT "leads_consent_purpose_data_processing" CHECK ("leads"."consent_purpose" = 'data_processing'),
	CONSTRAINT "leads_converted_iff_student_id" CHECK (("leads"."status" = 'converted') = ("leads"."student_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "lead_verifications" ADD CONSTRAINT "lead_verifications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_consent_purpose_consent_term_version_consent_terms_purpose_version_fk" FOREIGN KEY ("consent_purpose","consent_term_version") REFERENCES "public"."consent_terms"("purpose","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_verifications_lead_id_idx" ON "lead_verifications" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_one_open_email_idx" ON "leads" USING btree ("email") WHERE "leads"."status" in ('new', 'contacted');--> statement-breakpoint
CREATE INDEX "leads_status_created_at_idx" ON "leads" USING btree ("status","created_at");