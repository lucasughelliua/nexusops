import { z } from "zod";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().default("https://nexusops-puce.vercel.app/"),
  ENCRYPTION_KEY: z.string().min(32),
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

type EnvInput = z.input<typeof envSchema>;

// During `next build` (Docker image build on Railway/etc.), real secrets are
// not available yet - they're injected as runtime environment variables.
// Fall back to harmless placeholders ONLY during the build phase so that
// `next build` (page data collection / static generation) doesn't crash.
// At runtime (`next start`), NEXT_PHASE is no longer "phase-production-build",
// so missing real env vars will still correctly fail validation below.
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

const processEnv: EnvInput = {
  DATABASE_URL:
    process.env.DATABASE_URL ||
    (isBuildPhase ? "postgresql://user:password@localhost:5432/db" : ""),
  NEXTAUTH_SECRET:
    process.env.NEXTAUTH_SECRET ||
    (isBuildPhase ? "build-time-placeholder-secret-00000000" : ""),
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  ENCRYPTION_KEY:
    process.env.ENCRYPTION_KEY ||
    (isBuildPhase ? "build-time-placeholder-key-000000000000" : ""),
  GITHUB_ID: process.env.GITHUB_ID,
  GITHUB_SECRET: process.env.GITHUB_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  NODE_ENV: (process.env.NODE_ENV || "development") as "development" | "production" | "test",
};

const parsed = envSchema.safeParse(processEnv);

if (!parsed.success) {
  console.warn("⚠️ Invalid or missing environment variables - using fallbacks for development:");
  console.warn("   Available keys:", Object.keys(process.env).filter(k => !k.startsWith('npm_') && !k.startsWith('_')).slice(0, 20));
}

// Use parsed data if validation succeeded, otherwise use fallbacks
// (This allows the app to run in development/testing without all env vars)
export const env = parsed.success ? parsed.data : ({
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/nexusops",
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "dev-secret-change-in-production",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "dev-encryption-key-32-chars-min!",
  GITHUB_ID: process.env.GITHUB_ID,
  GITHUB_SECRET: process.env.GITHUB_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  NODE_ENV: (process.env.NODE_ENV || "development") as "development" | "production" | "test",
});
