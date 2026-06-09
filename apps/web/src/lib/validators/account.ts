import { z } from "zod";
import { Platform } from "@prisma/client";

export const createAccountSchema = z.object({
  name: z.string().min(2, "Account name must be at least 2 characters").max(100),
  description: z.string().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(2, "Account name must be at least 2 characters").max(100),
  description: z.string().optional(),
});

export const credentialSchema = z.object({
  accountId: z.string(),
  platform: z.nativeEnum(Platform),
  type: z.string().min(1, "Type is required"),
  name: z.string().min(1, "Name is required"),
  value: z.string().min(1, "Value/Token is required"),
  expiresAt: z.date().optional(),
});

export const vtexCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.VTEX),
  type: z.enum(["appKey", "appToken"]),
});

export const mercadoLibreCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.MERCADO_LIBRE),
  type: z.enum(["access_token", "refresh_token"]),
});

export const metaCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.META),
  type: z.enum(["access_token", "business_account_id"]),
});

export const googleAdsCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.GOOGLE_ADS),
  type: z.enum(["access_token", "refresh_token", "customer_id"]),
});

export const kommodCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.KOMMO_CRM),
  type: z.enum(["api_token", "api_key"]),
});

export const perfitCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.PERFIT),
  type: z.enum(["api_key", "auth_token"]),
});

export const googleSheetsCredentialSchema = credentialSchema.extend({
  platform: z.literal(Platform.GOOGLE_SHEETS),
  type: z.enum(["access_token", "service_account"]),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CredentialInput = z.infer<typeof credentialSchema>;
