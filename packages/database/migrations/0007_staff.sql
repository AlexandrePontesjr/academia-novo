CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"position" text NOT NULL,
	"department" text,
	"hired_at" date NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "staff_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "staff_status_valid" CHECK ("staff"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "staff_id" uuid;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_one_current_staff_idx" ON "photos" USING btree ("staff_id") WHERE "photos"."is_current";--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_staff_id_version_unique" UNIQUE("staff_id","version");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_one_owner" CHECK (num_nonnulls("photos"."student_id", "photos"."staff_id") = 1);