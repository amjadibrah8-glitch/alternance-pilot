import { describe, it, expect } from "vitest";
import { canSend, canSubmit, shouldAutoAccept, isValidEmail, startOfParisDay } from "../src/lib/guards";

const base = { automation_paused: false, mode: "production" as const, daily_cap: 5 };

describe("canSend", () => {
  it("envoie au recruteur en production", () => {
    const r = canSend({ settings: base, sentToday: 0, recipient: "rh@acme.fr", ownEmail: "moi@gmail.com", alreadySent: false });
    expect(r).toEqual({ ok: true, recipient: "rh@acme.fr" });
  });
  it("redirige vers ma propre adresse en mode test", () => {
    const r = canSend({ settings: { ...base, mode: "test" }, sentToday: 0, recipient: "rh@acme.fr", ownEmail: "moi@gmail.com", alreadySent: false });
    expect(r).toEqual({ ok: true, recipient: "moi@gmail.com" });
  });
  it("bloque les doublons", () => {
    const r = canSend({ settings: base, sentToday: 0, recipient: "rh@acme.fr", ownEmail: "m@g.com", alreadySent: true });
    expect(r.ok).toBe(false);
  });
  it("bloque quand les automatisations sont arrêtées", () => {
    const r = canSend({ settings: { ...base, automation_paused: true }, sentToday: 0, recipient: "rh@acme.fr", ownEmail: "m@g.com", alreadySent: false });
    expect(r).toMatchObject({ ok: false, retryable: false });
  });
  it("met en attente quand le plafond est atteint", () => {
    const r = canSend({ settings: base, sentToday: 5, recipient: "rh@acme.fr", ownEmail: "m@g.com", alreadySent: false });
    expect(r).toMatchObject({ ok: false, retryable: true });
  });
  it("refuse un destinataire invalide", () => {
    for (const bad of [null, "", "pas-une-adresse", "a@b", "x y@z.fr"]) {
      const r = canSend({ settings: base, sentToday: 0, recipient: bad, ownEmail: "m@g.com", alreadySent: false });
      expect(r.ok).toBe(false);
    }
  });
});

describe("canSubmit", () => {
  it("respecte pause et plafond", () => {
    expect(canSubmit(base, 0).ok).toBe(true);
    expect(canSubmit({ ...base, automation_paused: true }, 0).ok).toBe(false);
    expect(canSubmit(base, 5).ok).toBe(false);
  });
});

describe("shouldAutoAccept", () => {
  const ok = { autoSend: true, paused: false, threshold: 80, score: 85, verdict: "recommandee" as const };
  it("accepte au-dessus du seuil", () => expect(shouldAutoAccept(ok)).toBe(true));
  it("refuse sous le seuil", () => expect(shouldAutoAccept({ ...ok, score: 79 })).toBe(false));
  it("refuse si le verdict n'est pas recommandee", () => expect(shouldAutoAccept({ ...ok, verdict: "a_voir" })).toBe(false));
  it("refuse si l'envoi auto est désactivé", () => expect(shouldAutoAccept({ ...ok, autoSend: false })).toBe(false));
  it("refuse si tout est arrêté", () => expect(shouldAutoAccept({ ...ok, paused: true })).toBe(false));
});

describe("isValidEmail", () => {
  it("accepte une adresse normale", () => expect(isValidEmail(" rh@entreprise.fr ")).toBe(true));
});

describe("startOfParisDay", () => {
  it("donne minuit heure de Paris (hiver, UTC+1)", () => {
    expect(startOfParisDay(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-01T23:00:00.000Z");
  });
  it("donne minuit heure de Paris (été, UTC+2)", () => {
    expect(startOfParisDay(new Date("2026-07-15T10:00:00Z"))).toBe("2026-07-14T22:00:00.000Z");
  });
  it("gère 23 h 30 UTC, déjà le lendemain à Paris", () => {
    expect(startOfParisDay(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-02T23:00:00.000Z");
  });
});
