CREATE TABLE "consent_terms" (
	"purpose" text NOT NULL,
	"version" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_terms_purpose_version_pk" PRIMARY KEY("purpose","version"),
	CONSTRAINT "consent_terms_purpose_valid" CHECK ("consent_terms"."purpose" in ('data_processing', 'image_use')),
	CONSTRAINT "consent_terms_version_positive" CHECK ("consent_terms"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"term_version" integer NOT NULL,
	"granted_by" text NOT NULL,
	"guardian_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "consents_granted_by_valid" CHECK ("consents"."granted_by" in ('student', 'guardian')),
	CONSTRAINT "consents_guardian_iff_granted_by_guardian" CHECK (("consents"."granted_by" = 'guardian') = ("consents"."guardian_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"phone" text NOT NULL,
	"relationship" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_relationship_valid" CHECK ("guardians"."relationship" in ('mother', 'father', 'legal_guardian', 'other'))
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_purpose_term_version_consent_terms_purpose_version_fk" FOREIGN KEY ("purpose","term_version") REFERENCES "public"."consent_terms"("purpose","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_one_active_idx" ON "consents" USING btree ("student_id","purpose") WHERE "consents"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "consents_student_id_granted_at_idx" ON "consents" USING btree ("student_id","granted_at");--> statement-breakpoint
CREATE INDEX "guardians_student_id_idx" ON "guardians" USING btree ("student_id","id");--> statement-breakpoint
-- Os termos são append-only (door 2), como a trilha: o banco recusa UPDATE, DELETE e TRUNCATE, venha
-- de onde vier. Publicar uma versão nova é uma migração que insere a linha.
CREATE FUNCTION consent_terms_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'consent_terms is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER consent_terms_no_change BEFORE UPDATE OR DELETE ON consent_terms FOR EACH ROW EXECUTE FUNCTION consent_terms_append_only();--> statement-breakpoint
CREATE TRIGGER consent_terms_no_truncate BEFORE TRUNCATE ON consent_terms FOR EACH STATEMENT EXECUTE FUNCTION consent_terms_append_only();--> statement-breakpoint
-- Versão 1 de cada finalidade, em texto de rascunho: o texto jurídico (PRD §12) entra como a
-- versão 2, por migração, e não troca este.
INSERT INTO consent_terms (purpose, version, text) VALUES
	('data_processing', 1, E'RASCUNHO - texto sem revisão jurídica.\nAutorizo a academia a tratar meus dados pessoais, inclusive os de saúde que eu informar, para cadastro, matrícula, controle de acesso e cobrança.\nPosso revogar este consentimento a qualquer momento.'),
	('image_use', 1, E'RASCUNHO - texto sem revisão jurídica.\nAutorizo a academia a registrar e usar a minha imagem para identificação na recepção e no controle de acesso.\nPosso revogar este consentimento a qualquer momento.');
