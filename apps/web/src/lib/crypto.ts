import crypto from "crypto";
import { env } from "@/env";

const algorithm = "aes-256-gcm";
const keyLength = 32; // 256 bits

// Derive key from ENCRYPTION_KEY
const getKey = (): Buffer => {
  const key = crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
  return key;
};

/**
 * Encrypt sensitive data (credentials)
 * Returns format: "iv:authTag:encryptedData" (base64 encoded)
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const key = getKey();

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Combine: iv + authTag + encryptedData
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]);
  return combined.toString("base64");
}

/**
 * Decrypt sensitive data
 */
export function decrypt(ciphertext: string): string {
  try {
    const combined = Buffer.from(ciphertext, "base64");

    // Extract components
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(16, 32);
    const encrypted = combined.slice(32).toString("hex");

    const key = getKey();

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt credential");
  }
}

/**
 * Hash password for user authentication
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512");
  return salt.toString("hex") + ":" + hash.toString("hex");
}

/**
 * Verify password
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512");
  return hash.toString("hex") === hashHex;
}
