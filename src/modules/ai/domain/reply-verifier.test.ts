import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFeatureClaims, extractPhones, extractPrices, extractSpokenAmounts, verifyReply } from "./reply-verifier";

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

describe("precios de las tablas de información", () => {
  it("acepta un precio que viene como texto en una fila de la tabla", () => {
    const toolOutputs = [JSON.stringify({ ok: true, table: "Tarifas", rows: [{ servicio: "Avalúo", valor: "$350.000" }, { servicio: "Estudio de títulos", valor: "180000" }] })];
    assert.equal(verifyReply("El avalúo cuesta $350.000 y el estudio de títulos $180.000.", { toolOutputs, businessContext: "" }).ok, true);
    assert.equal(verifyReply("El avalúo cuesta $400.000.", { toolOutputs, businessContext: "" }).ok, false);
  });
});

describe("características del inmueble", () => {
  const ficha = JSON.stringify([
    { code: "INV-0002", title: "Apartamento para estrenar en La Enea", priceCop: 285000000, details: "", photosCount: 0 },
    { code: "INV-0007", title: "Apartamento en Álamos", priceCop: 2300000, details: "Habitaciones: 2, Baños: 2, Área: 68 m²" },
  ]);

  it("lee habitaciones, baños y área en los dos órdenes", () => {
    assert.deepEqual(extractFeatureClaims("3 habitaciones, dos baños y 72 m²").sort(), ["banos:2", "habitaciones:3", "m2:72"]);
    assert.deepEqual(extractFeatureClaims("Habitaciones: 2, Área: 68 m²").sort(), ["habitaciones:2", "m2:68"]);
  });

  it("bloquea habitaciones que no están en la ficha (caso C05)", () => {
    const r = verifyReply("Apartamento para estrenar en La Enea, 3 habitaciones y parqueadero – $285.000.000", { toolOutputs: [ficha], businessContext: "" });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(" "), /3 habitaciones/);
  });

  it("deja pasar lo que trae la ficha, lo que pidió el cliente o lo que ya se dijo", () => {
    assert.equal(verifyReply("El de Álamos tiene 2 habitaciones y 68 m², a $2.300.000.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
    assert.equal(verifyReply("Entiendo, busca 3 habitaciones. ¿En qué ciudad?", { toolOutputs: [], businessContext: "", clientText: "quiero 3 habitaciones" }).ok, true);
    assert.equal(verifyReply("Sí, el de 2 alcobas.", { toolOutputs: [], businessContext: "", previousReplies: "Tiene 2 habitaciones" }).ok, true);
  });

  it("no afirma que acepta mascotas si la ficha no lo dice (caso C01)", () => {
    assert.equal(verifyReply("Ese apartamento acepta mascotas.", { toolOutputs: [ficha], businessContext: "" }).ok, false);
    assert.equal(verifyReply("Un asesor le confirma si acepta mascotas.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
    assert.equal(verifyReply("No acepta mascotas.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
  });
});
