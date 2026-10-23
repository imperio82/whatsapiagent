import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateLoan } from "./financing";

describe("simulateLoan", () => {
  it("calcula la cuota fija con tasa efectiva anual", () => {
    const result = simulateLoan({ price: 100_000_000, downPayment: 30_000_000, annualRatePercent: 12, months: 60 });
    assert.ok(result.ok);
    assert.equal(result.financedAmount, 70_000_000);
    // Tasa mensual equivalente ≈ 0,9489 %
    assert.equal(result.monthlyRatePercent, 0.95);
    assert.equal(result.monthlyPayment, 1_535_499);
    assert.equal(result.totalPaid, result.monthlyPayment * 60);
  });

  it("sin interés reparte el monto en partes iguales", () => {
    const result = simulateLoan({ price: 12_000_000, downPayment: 0, annualRatePercent: 0, months: 12 });
    assert.ok(result.ok);
    assert.equal(result.monthlyPayment, 1_000_000);
  });

  it("rechaza datos imposibles", () => {
    assert.equal(simulateLoan({ price: 10, downPayment: 10, annualRatePercent: 10, months: 12 }).ok, false);
    assert.equal(simulateLoan({ price: 10_000, downPayment: 0, annualRatePercent: 10, months: 0 }).ok, false);
    assert.equal(simulateLoan({ price: 10_000, downPayment: 0, annualRatePercent: 10, months: 12.5 }).ok, false);
  });
});
