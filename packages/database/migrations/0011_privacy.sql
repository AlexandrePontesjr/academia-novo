CREATE TABLE "privacy_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"inactive_student_retention_years" integer,
	"photo_version_retention_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_settings_single_row" CHECK ("privacy_settings"."id"),
	CONSTRAINT "privacy_settings_years_range" CHECK ("privacy_settings"."inactive_student_retention_years" BETWEEN 1 AND 20),
	CONSTRAINT "privacy_settings_days_range" CHECK ("privacy_settings"."photo_version_retention_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
INSERT INTO "privacy_settings" DEFAULT VALUES;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "cpf" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "position" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "hired_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "cpf" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "birth_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "inactivated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "students" SET "inactivated_at" = coalesce((
	SELECT "audit_logs"."created_at" FROM "audit_logs"
	 WHERE "audit_logs"."entity" = 'student' AND "audit_logs"."entity_id" = "students"."id"
	   AND "audit_logs"."diff"->'values'->'status'->>'to' = 'inactive'
	 ORDER BY "audit_logs"."created_at" DESC, "audit_logs"."id" DESC LIMIT 1
), "students"."updated_at") WHERE "students"."status" = 'inactive';--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_anonymized_clean" CHECK ("staff"."anonymized_at" IS NULL OR ("staff"."name" = 'Titular anonimizado' AND "staff"."status" = 'inactive' AND "staff"."user_id" IS NULL AND "staff"."cpf" IS NULL AND "staff"."position" IS NULL AND "staff"."department" IS NULL AND "staff"."hired_at" IS NULL AND "staff"."phone" IS NULL AND "staff"."email" IS NULL));--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_identified_complete" CHECK ("staff"."anonymized_at" IS NOT NULL OR ("staff"."cpf" IS NOT NULL AND "staff"."position" IS NOT NULL AND "staff"."hired_at" IS NOT NULL AND "staff"."phone" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_anonymized_clean" CHECK ("students"."anonymized_at" IS NULL OR ("students"."name" = 'Titular anonimizado' AND "students"."status" = 'inactive' AND "students"."cpf" IS NULL AND "students"."birth_date" IS NULL AND "students"."sex" IS NULL AND "students"."email" IS NULL AND "students"."phone" IS NULL AND "students"."address" IS NULL AND "students"."emergency_contact_name" IS NULL AND "students"."emergency_contact_phone" IS NULL AND "students"."health_notes_enc" IS NULL AND "students"."inactivated_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_identified_complete" CHECK ("students"."anonymized_at" IS NOT NULL OR ("students"."cpf" IS NOT NULL AND "students"."birth_date" IS NOT NULL AND "students"."phone" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_inactivated_at_matches" CHECK (("students"."status" = 'inactive') = ("students"."inactivated_at" IS NOT NULL));