CREATE TABLE "password_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "password_tokens_purpose_valid" CHECK ("password_tokens"."purpose" in ('first_access', 'reset'))
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_valid";--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "student_id" uuid;--> statement-breakpoint
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_tokens_user_id_idx" ON "password_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_one_pending_idx" ON "photos" USING btree ("student_id") WHERE "photos"."pending";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_unique" UNIQUE("student_id");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_pending_not_current" CHECK (not ("photos"."pending" and "photos"."is_current"));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_pending_student" CHECK (not "photos"."pending" or "photos"."student_id" is not null);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_link" CHECK (("users"."role" = 'student') = ("users"."student_id" is not null));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_valid" CHECK ("users"."role" in ('admin', 'reception', 'hr_finance', 'instructor', 'student'));