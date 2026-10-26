import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmationMessage, needsConfirmationNotice } from "./confirmation";

const at = new Date("2026-10-29T20:00:00Z"); // jueves 29 de octubre, 3:00 p. m. en Colombia
const later = new Date("2026-10-30T15:00:00Z");

describe("needsConfirmationNotice", () => {
  it("avisa cuando una solicitud queda confirmada con hora", () => {
    assert.equal(needsConfirmationNotice({ status: "REQUESTED", scheduledAt: null }, { status: "CONFIRMED", scheduledAt: at }), true);
  });

  it("avisa cuando una cita confirmada cambia de hora", () => {
    assert.equal(needsConfirmationNotice({ status: "CONFIRMED", scheduledAt: at }, { status: "CONFIRMED", scheduledAt: later }), true);
  });

  it("no avisa si nada cambió, si no tiene hora o si no quedó confirmada", () => {
    assert.equal(needsConfirmationNotice({ status: "CONFIRMED", scheduledAt: at }, { status: "CONFIRMED", scheduledAt: new Date(at) }), false);
    assert.equal(needsConfirmationNotice({ status: "REQUESTED", scheduledAt: null }, { status: "CONFIRMED", scheduledAt: null }), false);
    assert.equal(needsConfirmationNotice({ status: "CONFIRMED", scheduledAt: at }, { status: "CANCELLED", scheduledAt: at }), false);
  });
});

describe("confirmationMessage", () => {
  it("dice el bien, el día y la hora en hora de Colombia", () => {
    const text = confirmationMessage({
      firstName: "Ana",
      scheduledAt: at,
      listing: { title: "Apartamento en Palermo", kind: "PROPERTY" },
      advisor: "Carlos Gómez",
      moved: false,
    });
    assert.match(text, /^✅ Hola Ana, su visita para ver Apartamento en Palermo quedó confirmada para el jueves, 29 de octubre/);
    assert.match(text, /a las 3:00/);
    assert.match(text, /Lo atiende Carlos\./);
  });

  it("habla de prueba de manejo para vehículos y avisa el cambio de hora", () => {
    const text = confirmationMessage({ firstName: "", scheduledAt: at, listing: { title: "Mazda CX-5", kind: "VEHICLE" }, advisor: null, moved: true });
    assert.match(text, /^✅ Hola, su prueba de manejo del Mazda CX-5 cambió de hora y quedó confirmada/);
    assert.doesNotMatch(text, /Lo atiende/);
  });
});
