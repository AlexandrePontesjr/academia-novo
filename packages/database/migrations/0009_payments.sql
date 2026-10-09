CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" date NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "payments_amount_cents_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_method_valid" CHECK ("payments"."method" in ('cash', 'pix', 'debit_card', 'credit_card', 'bank_transfer'))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_enrollment_id_idx" ON "payments" USING btree ("enrollment_id");