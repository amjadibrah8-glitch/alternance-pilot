import { describe, it, expect } from "vitest";
import { fingerprint, normalize } from "../src/lib/dedup";

describe("dédoublonnage", () => {
  it("ignore accents, casse et mentions H/F", () => {
    expect(fingerprint("Société Générale", "Data Analyst (H/F)")).toBe(fingerprint("societe generale", "data analyst"));
  });
  it("garde distinctes deux offres différentes", () => {
    expect(fingerprint("Acme", "Data Analyst")).not.toBe(fingerprint("Acme", "Data Engineer"));
  });
  it("normalise la ponctuation", () => {
    expect(normalize("Alternance - Analyste BI / Reporting")).toBe("alternance analyste bi reporting");
  });
});
