import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreMatch, suggestedMessage, type MatchBuyer, type MatchListing } from "./match";

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
});
