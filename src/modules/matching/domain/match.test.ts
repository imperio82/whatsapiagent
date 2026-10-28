import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MATCH_RULES, evaluateMatch, matchRulesFrom, scoreMatch, suggestedMessage, type MatchBuyer, type MatchListing } from "./match";

const tracker: MatchListing = {
  kind: "VEHICLE",
  operation: "SALE",
  title: "Chevrolet Tracker LTZ 2021",
  description: "Camioneta automática, un solo dueño",
  priceCop: 82_000_000,
  city: "Manizales",
  zone: null,
  attributes: { Año: "2021", Kilometraje: "35.000 km" },
};

const buyer = (b: Partial<MatchBuyer>): MatchBuyer => ({
  searchKind: null,
  searchOperation: null,
  budgetMaxCop: null,
  searchCity: null,
  wants: null,
  ...b,
});

describe("scoreMatch", () => {
  it("coincide por tipo, presupuesto y ciudad", () => {
    const r = scoreMatch(tracker, buyer({ searchKind: "VEHICLE", budgetMaxCop: 90_000_000, searchCity: "Manizales" }));
    assert.ok(r);
    assert.equal(r.score, 6);
    assert.ok(r.reasons.includes("en Manizales"));
  });

  it("acepta hasta 10 % por encima del presupuesto", () => {
    assert.ok(scoreMatch(tracker, buyer({ searchKind: "VEHICLE", budgetMaxCop: 75_000_000 })));
    assert.equal(scoreMatch(tracker, buyer({ searchKind: "VEHICLE", budgetMaxCop: 70_000_000 })), null);
  });

  it("descarta si busca otro tipo, otra operación u otra ciudad", () => {
    assert.equal(scoreMatch(tracker, buyer({ searchKind: "PROPERTY" })), null);
    assert.equal(scoreMatch(tracker, buyer({ searchKind: "VEHICLE", searchOperation: "RENT" })), null);
    assert.equal(scoreMatch(tracker, buyer({ searchKind: "VEHICLE", searchCity: "Pereira" })), null);
  });

  it("cuenta las palabras de lo que busca", () => {
    const r = scoreMatch(tracker, buyer({ searchKind: "VEHICLE", wants: "Camioneta automática para la familia" }));
    assert.ok(r);
    assert.equal(r.score, 4);
  });

  it("sin tipo ni palabras en común no propone nada", () => {
    assert.equal(scoreMatch(tracker, buyer({ budgetMaxCop: 100_000_000 })), null);
    assert.equal(scoreMatch(tracker, buyer({ wants: "apartamento en Palermo" })), null);
  });

  it("la ciudad acepta el barrio", () => {
    const apto: MatchListing = { ...tracker, kind: "PROPERTY", title: "Apartamento", city: "Manizales", zone: "Palermo" };
    assert.ok(scoreMatch(apto, buyer({ searchKind: "PROPERTY", searchCity: "Palermo" })));
  });
});

describe("suggestedMessage", () => {
  it("arma un mensaje corto con el bien y el motivo", () => {
    const text = suggestedMessage({
      clientName: "Carlos Restrepo",
      agentName: "Valentina",
      businessName: "Eje Autos & Hogar",
      listing: tracker,
      wants: "Camioneta para la familia",
    });
    assert.match(text, /^Hola, Carlos, le escribe Valentina de Eje Autos & Hogar\./);
    assert.match(text, /Chevrolet Tracker LTZ 2021 \(2021, 35\.000 km\) en Manizales por \$82\.000\.000/);
    assert.match(text, /¿Le envío fotos o le agendo una visita\?$/);
  });

  it("un vehículo de otra ciudad coincide si el negocio no exige la misma ciudad", () => {
    const mazda: MatchListing = { ...tracker, title: "mazda cx3", description: null, priceCop: 80_000_000, city: "pereira", attributes: {} };
    const anderson = buyer({ searchKind: "VEHICLE", budgetMaxCop: 100_000_000, searchCity: "Manizales", wants: "automóvil o camioneta económica" });
    const r = evaluateMatch(mazda, anderson);
    assert.equal(r?.status, "match");
    assert.ok(r?.reasons.some((x) => x.includes("Manizales")));

    const strict = { ...DEFAULT_MATCH_RULES, sameCity: { ...DEFAULT_MATCH_RULES.sameCity, VEHICLE: true } };
    const near = evaluateMatch(mazda, anderson, strict);
    assert.equal(near?.status, "near");
    assert.equal(near?.status === "near" && near.missed, "busca en Manizales");
    assert.equal(scoreMatch(mazda, anderson, strict), null);

    const nearby = { ...strict, nearbyCities: ["Pereira", "Manizales", "Armenia"] };
    assert.equal(evaluateMatch(mazda, anderson, nearby)?.status, "match");
  });

  it("los inmuebles exigen la misma ciudad por defecto", () => {
    const apto: MatchListing = { ...tracker, kind: "PROPERTY", title: "Apartamento", city: "Pereira", zone: "Pinares" };
    assert.equal(evaluateMatch(apto, buyer({ searchKind: "PROPERTY", budgetMaxCop: 90_000_000, searchCity: "Manizales" }))?.status, "near");
  });

  it("casi coincide solo si falla una condición", () => {
    const r = evaluateMatch(tracker, buyer({ searchKind: "VEHICLE", budgetMaxCop: 50_000_000, searchCity: "Manizales" }));
    assert.equal(r?.status, "near");
    assert.match(r?.status === "near" ? r.missed : "", /presupuesto/);
    assert.equal(
      evaluateMatch(tracker, buyer({ searchKind: "VEHICLE", searchOperation: "RENT", budgetMaxCop: 50_000_000, searchCity: "Manizales" })),
      null,
    );
  });

  it("lee las reglas guardadas con sus valores por defecto", () => {
    assert.deepEqual(matchRulesFrom(null), DEFAULT_MATCH_RULES);
    const r = matchRulesFrom({ sameCity: { VEHICLE: true }, nearbyCities: [" Pereira ", "", 3] });
    assert.equal(r.sameCity.VEHICLE, true);
    assert.equal(r.sameCity.PROPERTY, true);
    assert.deepEqual(r.nearbyCities, ["Pereira"]);
  });
});
