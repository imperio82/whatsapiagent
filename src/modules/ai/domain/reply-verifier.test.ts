import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPhones, extractPrices, extractSpokenAmounts, verifyReply } from "./reply-verifier";

describe("extractPrices", () => {
  it("lee precios de tienda", () => {
    assert.deepEqual(extractPrices("Vale $4.500 y la otra $ 12.000,50"), [4500, 12000.5]);
  });

  it("lee millones con y sin palabra", () => {
    assert.deepEqual(extractPrices("$98.000.000, $98 millones, $98,5 millones y $30M"), [98_000_000, 98_000_000, 98_500_000, 30_000_000]);
  });

  it("no confunde palabras que empiezan por m", () => {
    assert.deepEqual(extractPrices("$4.500 mensuales"), [4500]);
  });
});

describe("extractSpokenAmounts", () => {
  it("lee montos sin signo", () => {
    assert.deepEqual(extractSpokenAmounts("tengo 30 millones de inicial"), [30_000_000]);
    assert.deepEqual(extractSpokenAmounts("ofrezco 90.000.000"), [90_000_000]);
    assert.deepEqual(extractSpokenAmounts("le doy 85 palos"), [85_000_000]);
  });
});

describe("extractPhones", () => {
  it("encuentra celulares con o sin indicativo", () => {
    assert.deepEqual(extractPhones("llame al 300 123 4567 o al +57 310-555-1234"), ["3001234567", "3105551234"]);
  });

  it("no toma precios ni kilometrajes como teléfonos", () => {
    assert.deepEqual(extractPhones("Mazda CX-5 2021, 48.000 km, $98.000.000"), []);
  });
});

describe("verifyReply", () => {
  const listing = JSON.stringify([{ id: "l1", title: "Mazda CX-5 2021", priceCop: 98_000_000 }]);

  it("acepta el precio del inventario escrito en millones", () => {
    const r = verifyReply("La Mazda CX-5 2021 está en $98 millones.", { toolOutputs: [listing], businessContext: "" });
    assert.equal(r.ok, true, r.problems.join(" "));
  });

  it("rechaza un precio inventado", () => {
    const r = verifyReply("Se la dejo en $90.000.000.", { toolOutputs: [listing], businessContext: "" });
    assert.equal(r.ok, false);
  });

  it("acepta repetir el presupuesto que dio el cliente", () => {
    const r = verifyReply("Perfecto, con $30.000.000 de cuota inicial podemos mirar opciones.", {
      toolOutputs: [listing],
      businessContext: "",
      clientText: "Crédito, tengo 30 millones de cuota inicial",
    });
    assert.equal(r.ok, true, r.problems.join(" "));
  });

  it("bloquea el teléfono de un tercero", () => {
    const r = verifyReply("El dueño es Pedro, su número es 311 222 3344.", { toolOutputs: [listing], businessContext: "" });
    assert.equal(r.ok, false);
  });

  it("permite el teléfono del negocio y el del cliente", () => {
    const r = verifyReply("Le escribimos al 320 531 8658 o lo llamamos al 300 111 2233.", {
      toolOutputs: [],
      businessContext: "Teléfono del negocio: 320 531 8658",
      clientText: "mi número es 300 111 2233",
    });
    assert.equal(r.ok, true, r.problems.join(" "));
  });
});
