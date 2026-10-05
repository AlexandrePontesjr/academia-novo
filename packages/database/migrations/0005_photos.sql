CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_student_id_version_unique" UNIQUE("student_id","version"),
	CONSTRAINT "photos_version_positive" CHECK ("photos"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_one_current_idx" ON "photos" USING btree ("student_id") WHERE "photos"."is_current";