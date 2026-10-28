import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sinceLastInbound, windowClosedReason, windowState } from "./messaging-window";

const now = new Date("2026-10-28T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("ventana de 24 horas de WhatsApp", () => {
  it("con la API oficial se cierra a las 24 horas del último mensaje del cliente", () => {
    assert.equal(windowState("meta", hoursAgo(23), now).open, true);
    assert.equal(windowState("meta", hoursAgo(25), now).open, false);
    assert.equal(windowState("twilio", hoursAgo(30), now).open, false);
    assert.equal(windowState("meta", null, now).open, false);
  });

  it("con WhatsApp Web no hay ventana", () => {
    assert.equal(windowState("baileys", hoursAgo(500), now).open, true);
    assert.equal(windowState("baileys", null, now).open, true);
  });

  it("explica cuánto hace que escribió el cliente", () => {
    assert.equal(sinceLastInbound(hoursAgo(30), now), "escribió por última vez hace 30 horas");
    assert.equal(sinceLastInbound(hoursAgo(80), now), "escribió por última vez hace 3 días");
    assert.match(windowClosedReason(null, now), /^El cliente nunca le ha escrito al negocio\. Pasadas 24 horas/);
  });
});
