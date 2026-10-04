-- Texto de busca e de ordem por nome: sem caixa e sem acento. IMMUTABLE para poder ser indexada.
-- Sem a extensão `unaccent`: a tradução é por lista, o bastante para nomes em português.
CREATE FUNCTION students_fold(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
	SELECT lower(translate($1,
		'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
		'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"birth_date" date NOT NULL,
	"sex" text,
	"email" text,
	"phone" text NOT NULL,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"health_notes_enc" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_cpf_unique" UNIQUE("cpf"),
	CONSTRAINT "students_status_valid" CHECK ("students"."status" in ('active', 'inactive', 'suspended'))
);
--> statement-breakpoint
CREATE INDEX "students_name_fold_trgm_idx" ON "students" USING gin (students_fold("name") gin_trgm_ops);