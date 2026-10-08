CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "enrollments_ends_at_not_before_starts_at" CHECK ("enrollments"."ends_at" >= "enrollments"."starts_at"),
	CONSTRAINT "enrollments_price_cents_not_negative" CHECK ("enrollments"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"period" text NOT NULL,
	"price_cents" integer NOT NULL,
	"rules" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_period_valid" CHECK ("plans"."period" in ('monthly', 'quarterly', 'semiannual', 'annual')),
	CONSTRAINT "plans_status_valid" CHECK ("plans"."status" in ('active', 'inactive')),
	CONSTRAINT "plans_price_cents_not_negative" CHECK ("plans"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollments_student_id_starts_at_idx" ON "enrollments" USING btree ("student_id","starts_at");--> statement-breakpoint
-- Dois períodos não cancelados do mesmo aluno nunca têm um dia em comum (door 5): quem decide é o
-- banco, venha a linha de onde vier. `btree_gist` dá ao GiST a igualdade de `uuid`; o intervalo é
-- fechado nos dois lados porque `ends_at` é o último dia coberto. O Drizzle não descreve restrição
-- de exclusão, então ela vive só aqui.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_no_overlap" EXCLUDE USING gist ("student_id" WITH =, daterange("starts_at", "ends_at", '[]') WITH &&) WHERE ("cancelled_at" IS NULL);
