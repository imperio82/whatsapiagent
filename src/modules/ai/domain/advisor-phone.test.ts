import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { samePhone, senderDigits } from "./advisor-phone";

describe("senderDigits", () => {
  it("saca los dígitos de un JID, de Twilio o de Meta", () => {
    assert.equal(senderDigits("573001234567@s.whatsapp.net"), "573001234567");
    assert.equal(senderDigits("whatsapp:+573001234567"), "573001234567");
    assert.equal(senderDigits("573001234567"), "573001234567");
  });

  it("no reconoce un LID como teléfono", () => {
    assert.equal(senderDigits("48404818309348@lid"), null);
  });
});

describe("samePhone", () => {
  it("acepta el número con o sin indicativo", () => {
    assert.equal(samePhone("573001234567", "3001234567"), true);
    assert.equal(samePhone("+57 300 123 4567", "573001234567"), true);
  });

  it("distingue números diferentes", () => {
    assert.equal(samePhone("573001234567", "573001234568"), false);
    assert.equal(samePhone("1234567", "991234567"), false);
  });

  it("no confunde un número vacío con otro", () => {
    assert.equal(samePhone(null, "573001234567"), false);
    assert.equal(samePhone("", ""), false);
  });
});
