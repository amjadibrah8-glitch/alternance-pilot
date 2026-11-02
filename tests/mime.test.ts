import { describe, it, expect } from "vitest";
import { buildMime } from "../src/lib/mime";

const decode = (b64url: string) => Buffer.from(b64url, "base64url").toString("utf8");

describe("buildMime", () => {
  it("encode un objet accentué en RFC 2047", () => {
    const raw = decode(buildMime({ from: "A <a@g.com>", to: "b@x.fr", subject: "Candidature – alternance été", text: "Bonjour" }));
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).not.toContain("Subject: Candidature – alternance été");
  });
  it("joint le PDF dans un multipart", () => {
    const pdf = Buffer.from("%PDF-1.4 test");
    const raw = decode(
      buildMime({
        from: "a@g.com",
        to: "b@x.fr",
        subject: "Test",
        text: "Corps du message",
        attachment: { filename: "CV.pdf", contentType: "application/pdf", data: pdf },
      }),
    );
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain('filename="CV.pdf"');
    expect(raw).toContain(pdf.toString("base64"));
    expect(raw).toContain(Buffer.from("Corps du message").toString("base64"));
  });
  it("produit du base64url sans + ni /", () => {
    const out = buildMime({ from: "a@g.com", to: "b@x.fr", subject: "S", text: "?".repeat(500) });
    expect(/^[A-Za-z0-9_-]+$/.test(out)).toBe(true);
  });
});
