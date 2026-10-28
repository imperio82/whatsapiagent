import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_OFFER_POLICY, decideOffer, offerPolicyFrom } from "./offer-policy";

const available = { status: "AVAILABLE", priceCop: 285_000_000 };

describe("política de ofertas", () => {
  it("una oferta mayor al precio se guarda al precio publicado y sigue el cierre (caso C08)", () => {
    const d = decideOffer(available, 300_000_000, DEFAULT_OFFER_POLICY);
    assert.deepEqual(d, { record: true, amount: 285_000_000, acceptsPrice: true, waitlist: false, handoff: false });
  });

  it("con la política de asesor, la misma oferta pasa a una persona", () => {
    const d = decideOffer(available, 285_000_000, { ...DEFAULT_OFFER_POLICY, atOrAbovePrice: "advisor" });
    assert.equal(d.record && d.handoff, true);
  });

  it("una oferta menor se registra tal cual y pasa a un asesor (caso C17)", () => {
    assert.deepEqual(decideOffer({ status: "AVAILABLE", priceCop: 360_000_000 }, 300_000_000, DEFAULT_OFFER_POLICY), {
      record: true,
      amount: 300_000_000,
      acceptsPrice: false,
      waitlist: false,
      handoff: true,
    });
  });

  it("sobre un reservado no se registra, salvo con lista de espera (caso C12)", () => {
    const reserved = { status: "RESERVED", priceCop: 500_000_000 };
    assert.deepEqual(decideOffer(reserved, 450_000_000, DEFAULT_OFFER_POLICY), { record: false, reason: "reservado" });
    const waitlist = decideOffer(reserved, 450_000_000, { ...DEFAULT_OFFER_POLICY, onReserved: "waitlist" });
    assert.equal(waitlist.record && waitlist.waitlist && !waitlist.handoff, true);
  });

  it("sobre un vendido nunca se registra", () => {
    assert.deepEqual(decideOffer({ status: "SOLD", priceCop: 1 }, 1, { onReserved: "waitlist", atOrAbovePrice: "close" }), {
      record: false,
      reason: "vendido",
    });
  });

  it("lee la política guardada y completa con los valores por defecto", () => {
    assert.deepEqual(offerPolicyFrom(null), DEFAULT_OFFER_POLICY);
    assert.deepEqual(offerPolicyFrom({ onReserved: "waitlist", atOrAbovePrice: "otro" }), { onReserved: "waitlist", atOrAbovePrice: "close" });
  });
});
