import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectionsCatalog, normalizeText, prepareTable, rankRows, searchTextOf, tableFromJson } from "./collections";

describe("colecciones", () => {
  it("convierte un JSON anidado en tabla", () => {
    const t = tableFromJson(
      JSON.stringify([
        { sede: "Centro", horario: { semana: "8 a 6", sabado: "9 a 1" }, servicios: ["avalúos", "arriendos"] },
        { sede: "Norte", telefono: "6061234" },
      ]),
    );
    assert.deepEqual(t.columns, ["sede", "horario.semana", "horario.sabado", "servicios", "telefono"]);
    assert.equal(t.rows[0]!.servicios, "avalúos, arriendos");
    assert.equal(t.rows[1]!["horario.semana"], "");
  });

  it("encuentra la lista dentro de un objeto", () => {
    const t = tableFromJson(JSON.stringify({ empresa: "X", datos: [{ zona: "Palermo" }, { zona: "La Enea" }] }));
    assert.equal(t.rows.length, 2);
  });

  it("quita columnas vacías y filas en blanco", () => {
    const t = prepareTable({ columns: ["a", "vacia"], rows: [{ a: "1", vacia: "" }, { a: " ", vacia: "" }] });
    assert.deepEqual(t.columns, ["a"]);
    assert.equal(t.rows.length, 1);
  });

  it("busca sin tildes y ordena por coincidencias", () => {
    const rows = [
      { searchText: searchTextOf({ zona: "Palermo", tarifa: "$2.100.000" }) },
      { searchText: searchTextOf({ zona: "La Enea", tarifa: "$1.750.000" }) },
      { searchText: searchTextOf({ zona: "Palermo Sur", tarifa: "$1.900.000", nota: "admite mascotas" }) },
    ];
    const found = rankRows(rows, "Palermo mascotas", 10);
    assert.equal(found.length, 2);
    assert.ok(found[0]!.searchText.includes("mascotas"));
    assert.equal(normalizeText("  Avalúo   CATASTRAL "), "avaluo catastral");
  });

  it("le describe las tablas al agente", () => {
    const text = collectionsCatalog([{ name: "Sedes", description: "Horarios por sede", columns: ["sede", "horario"], rowCount: 3 }]);
    assert.match(text!, /"Sedes": Horarios por sede \(3 filas; columnas: sede, horario\)/);
    assert.equal(collectionsCatalog([]), null);
  });
});
