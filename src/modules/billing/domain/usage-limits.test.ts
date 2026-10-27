import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLANS, limitsPlan, trialLimits } from "./plans";
import { capReached, decideResponse, limitLevel, type ContactSnapshot, type LimitsSnapshot } from "./usage-limits";

const USD = 1_000_000;
const plan = PLANS.EMPRENDE; // 500 clientes, US$10
const snap = (clientsServed: number, spentUsd = 0): LimitsSnapshot => ({
  plan,
  extraClients: 0,
  clientsServed,
  spentMicroUsd: spentUsd * USD,
  budgetMicroUsd: plan.aiBudgetUsd * USD,
});
const nuevo: ContactSnapshot = { alreadyServed: false, replies: 0, open: false };
const abierto: ContactSnapshot = { alreadyServed: true, replies: 5, open: true };
const now = new Date("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("límites de uso", () => {
  it("avisa al 70 % y al 90 %, con lo que se acabe primero", () => {
    assert.equal(limitLevel(snap(100)), "NORMAL");
    assert.equal(limitLevel(snap(350)), "AVISO_70");
    assert.equal(limitLevel(snap(100, 9.5)), "AVISO_90");
    assert.equal(limitLevel(snap(500)), "TOPE");
  });

  it("dentro del cupo responde la IA", () => {
    assert.equal(decideResponse(snap(499), nuevo, null, now).mode, "IA");
  });

  it("con el cupo lleno, un contacto ya atendido no suma y sigue con IA", () => {
    assert.equal(decideResponse(snap(500), { alreadyServed: true, replies: 3, open: false }, hoursAgo(1), now).mode, "IA");
    assert.equal(decideResponse(snap(500), nuevo, hoursAgo(1), now).mode, "ESPERA");
  });

  it("sin saldo de IA: los chats abiertos siguen 48 h, los demás esperan", () => {
    const sinSaldo = snap(100, 10);
    assert.ok(capReached(sinSaldo));
    assert.equal(decideResponse(sinSaldo, abierto, hoursAgo(10), now).mode, "GRACIA");
    assert.equal(decideResponse(sinSaldo, abierto, hoursAgo(49), now).mode, "ESPERA");
    assert.equal(decideResponse(sinSaldo, { ...abierto, open: false }, hoursAgo(10), now).mode, "ESPERA");
  });

  it("un contacto con 40 respuestas en el mes pasa a un asesor", () => {
    assert.equal(decideResponse(snap(10), { alreadyServed: true, replies: 40, open: true }, null, now).mode, "ESPERA");
  });
});

describe("recargas", () => {
  it("un paquete da sus clientes; un monto libre, al precio del cliente adicional del plan", async () => {
    const { rechargeQuote } = await import("./plans");
    assert.equal(rechargeQuote("EMPRENDE", 30_000).clients, 100);
    assert.equal(rechargeQuote("NEGOCIO", 130_000).clients, 500);
    // Libre: $45.000 a $300 por cliente en Emprende
    assert.equal(rechargeQuote("EMPRENDE", 45_000).clients, 150);
    // Saldo de IA en proporción al tope del plan: US$10 / 500 clientes = US$0,02 por cliente
    assert.equal(rechargeQuote("EMPRENDE", 30_000).creditUsd, 2);
  });

  it("la prueba gratis se mide a precio de venta, no a costo", () => {
    const limits = trialLimits(3, 3_900);
    assert.equal(limits.aiBudgetUsd, 0.9);
    assert.equal(limits.chats, 45);
    const trial = limitsPlan("PRO", limits);
    assert.equal(trial.chats, 45);
    // Lo que se recarga se sigue cobrando al precio del plan elegido
    assert.equal(trial.extraChatCop, PLANS.PRO.extraChatCop);
    assert.equal(limitsPlan("PRO", null), PLANS.PRO);
  });
});
