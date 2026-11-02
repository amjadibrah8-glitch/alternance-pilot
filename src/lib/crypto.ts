import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement AES-256-GCM des jetons OAuth avant stockage.
 * Format : base64(iv[12] | tag[16] | ciphertext).
 */
function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("La clé de chiffrement doit faire 32 octets.");
  return key;
}

export function encrypt(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string, base64Key: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
