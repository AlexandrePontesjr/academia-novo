import { z } from 'zod';

/** As três variantes WebP de uma foto (foto-pipeline, door 2): entram na chave, no caminho e na query. */
export const PHOTO_VARIANTS = ['thumb', 'medium', 'large'] as const;
export const photoVariantSchema = z.enum(PHOTO_VARIANTS, 'Escolha thumb, medium ou large.');
export type PhotoVariant = z.infer<typeof photoVariantSchema>;

/** Query de `GET /api/students/:id/photo` (AD-029): sem `variant`, vale `medium`. */
export const photoQuerySchema = z.object({
  variant: photoVariantSchema.optional(),
});
export type PhotoQuery = z.infer<typeof photoQuerySchema>;

/**
 * Query de `GET /api/photo-files/:photoId/:variant`: a assinatura é a credencial, então o schema
 * descreve `exp` e `sig` para o OpenAPI e aceita qualquer valor - quem decide é o assinador, e um
 * valor malformado é `403`, não `422` (door 4).
 */
const rawParameter = z.union([z.string(), z.array(z.string())]);
export const photoFileQuerySchema = z.object({
  exp: rawParameter.optional(),
  sig: rawParameter.optional(),
});
export type PhotoFileQuery = z.infer<typeof photoFileQuerySchema>;

/** Corpo do `201` de `POST /api/students/:id/photo`. */
export const photoCreatedSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().min(1),
  createdAt: z.iso.datetime(),
});
export type PhotoCreated = z.infer<typeof photoCreatedSchema>;

/** Corpo do `200` de `GET /api/students/:id/photo`. */
export const photoUrlResponseSchema = z.strictObject({
  url: z.string(),
  expiresAt: z.iso.datetime(),
});
export type PhotoUrlResponse = z.infer<typeof photoUrlResponseSchema>;
