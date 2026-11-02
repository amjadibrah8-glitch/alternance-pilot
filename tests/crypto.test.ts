import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../src/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("chiffre puis déchiffre", () => {
    const c = encrypt("1//refresh-token-secret", key);
    expect(c).not.toContain("refresh");
    expect(decrypt(c, key)).toBe("1//refresh-token-secret");
  });
  it("produit un chiffré différent à chaque fois (IV aléatoire)", () => {
    expect(encrypt("x", key)).not.toBe(encrypt("x", key));
  });
  it("rejette un chiffré altéré", () => {
    const c = Buffer.from(encrypt("secret", key), "base64");
    c[c.length - 1] ^= 1;
    expect(() => decrypt(c.toString("base64"), key)).toThrow();
  });
  it("rejette une mauvaise clé", () => {
    expect(() => decrypt(encrypt("secret", key), randomBytes(32).toString("base64"))).toThrow();
  });
});
