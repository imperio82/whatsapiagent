import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractFeatureClaims, extractPhones, extractPrices, extractSpokenAmounts, stripUnverified, verifyReply } from "./reply-verifier";

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
    { code: "INV-0002", title: "Apartamento para estrenar en La Enea", priceCop: 285000000, zone: "La Enea", details: "", photosCount: 0 },
    { code: "INV-0007", title: "Apartamento en Álamos", priceCop: 2300000, zone: "Álamos", details: "Habitaciones: 2, Baños: 2, Área: 68 m²" },
  ]);

  it("lee habitaciones, baños y área en los dos órdenes", () => {
    assert.deepEqual(extractFeatureClaims("3 habitaciones, dos baños y 72 m²").sort(), ["banos:2", "habitaciones:3", "m2:72"]);
    assert.deepEqual(extractFeatureClaims("Habitaciones: 2, Área: 68 m²").sort(), ["habitaciones:2", "m2:68"]);
  });

  it("bloquea habitaciones que no están en la ficha del bien mostrado (caso C05)", () => {
    const r = verifyReply("Apartamento para estrenar en La Enea, 3 habitaciones y parqueadero – $285.000.000", {
      toolOutputs: [ficha],
      businessContext: "",
      clientText: "busco 3 habitaciones con parqueadero",
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join(" "), /3 habitaciones/);
  });

  it("revisa también la frase siguiente que no nombra el bien (\"Tiene 3 habitaciones.\")", () => {
    const r = verifyReply("Le tengo el de La Enea a $285.000.000. Tiene 3 habitaciones.", { toolOutputs: [ficha], businessContext: "" });
    assert.equal(r.ok, false);
    const ok = verifyReply("Le tengo el de La Enea a $285.000.000. ¿Usted busca 3 habitaciones?", { toolOutputs: [ficha], businessContext: "" });
    assert.equal(ok.ok, true);
  });

  it("deja pasar lo que trae la ficha o lo que ya se dijo de ese bien", () => {
    assert.equal(verifyReply("El de Álamos tiene 2 habitaciones y 68 m², a $2.300.000.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
    assert.equal(
      verifyReply("El de Álamos tiene 2 habitaciones.", { toolOutputs: [ficha], businessContext: "", previousReplies: "Tiene 2 habitaciones" }).ok,
      true,
    );
  });

  it("no revisa los requisitos del cliente si no se mostró ningún inmueble (caso nuevo)", () => {
    const client = "Busco arriendo en Pereira, 2 habitaciones, parqueadero y tengo un perro";
    for (const reply of [
      "Perfecto, busco opciones de 2 habitaciones con parqueadero donde aceptan mascotas. ¿Qué presupuesto tiene?",
      "Entiendo, necesita 2 habitaciones y un baño. ¿Para cuándo lo necesita?",
    ]) {
      assert.equal(verifyReply(reply, { toolOutputs: [], businessContext: "", clientText: client }).ok, true, reply);
    }
  });

  it("no cuenta las preguntas ni los rangos como datos del bien", () => {
    assert.equal(verifyReply("¿El de Álamos le sirve con 3 habitaciones?", { toolOutputs: [ficha], businessContext: "" }).ok, true);
    assert.equal(verifyReply("En La Enea tengo opciones de 2 a 3 habitaciones.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
  });

  it("no afirma que un bien acepta mascotas si su ficha no lo dice (caso C01)", () => {
    assert.equal(verifyReply("Ese apartamento acepta mascotas.", { toolOutputs: [ficha], businessContext: "", clientText: "tengo un perro" }).ok, false);
    assert.equal(verifyReply("Un asesor le confirma si acepta mascotas.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
    assert.equal(verifyReply("No acepta mascotas.", { toolOutputs: [ficha], businessContext: "" }).ok, true);
  });

  it("la respuesta segura quita solo las frases que no pasan", () => {
    const evidence = { toolOutputs: [ficha], businessContext: "" };
    assert.equal(
      stripUnverified("Le tengo el de La Enea a $285.000.000. Tiene 3 habitaciones y parqueadero. ¿Le gustaría verlo?", evidence),
      "Le tengo el de La Enea a $285.000.000. ¿Le gustaría verlo?",
    );
    assert.equal(stripUnverified("El de La Enea tiene 3 habitaciones.", evidence), "");
  });
});
