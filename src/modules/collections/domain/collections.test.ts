import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanColumns,
  collectionsCatalog,
  manualRows,
  normalizeText,
  planColumnChanges,
  prepareTable,
  rankRows,
  rowValuesFor,
  searchTextOf,
  tableAccessByName,
  tableFromJson,
} from "./collections";

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

  it("las habilidades dan el acceso más alto por tabla", () => {
    const access = tableAccessByName([
      { table: "Reservas", access: "read" },
      { table: "Reservas", access: "write" },
      { table: "Sedes", access: "update" },
      { table: "Sedes", access: "read" },
    ]);
    assert.equal(access.get("Reservas"), "write");
    assert.equal(access.get("Sedes"), "update");
  });

  it("acomoda los valores a las columnas de la tabla", () => {
    const { values, unknown } = rowValuesFor(["Nombre", "Teléfono", "Fecha"], { nombre: " Ana ", telefono: 3001234567, color: "rojo" });
    assert.deepEqual(values, { Nombre: "Ana", Teléfono: "3001234567" });
    assert.deepEqual(unknown, ["color"]);
  });

  it("limpia los campos de una tabla hecha a mano y no deja repetidos", () => {
    assert.deepEqual(cleanColumns(["  Sede ", "Horario  de semana"]), ["Sede", "Horario de semana"]);
    assert.throws(() => cleanColumns(["Sede", "sedé"]), /repetido/);
    assert.throws(() => cleanColumns(["Sede", " "]), /nombre/);
    assert.throws(() => cleanColumns([]), /nombre/);
  });

  it("renombra, agrega y quita campos conservando los datos", () => {
    const plan = planColumnChanges(["Sede", "Horario", "Viejo"], [
      { from: "Horario", name: "Horario semana" },
      { from: "Sede", name: "Sede" },
      { name: "Teléfono" },
    ]);
    assert.deepEqual(plan.columns, ["Horario semana", "Sede", "Teléfono"]);
    assert.deepEqual(plan.removed, ["Viejo"]);
    assert.deepEqual(plan.remap({ Sede: "Centro", Horario: "8 a 6", Viejo: "x" }), {
      "Horario semana": "8 a 6",
      Sede: "Centro",
      Teléfono: "",
    });
    assert.throws(() => planColumnChanges(["Sede"], [{ from: "Otro", name: "Otro" }]), /no tiene/);
    assert.throws(() => planColumnChanges(["Sede"], [{ from: "Sede", name: "A" }, { from: "Sede", name: "B" }]), /dos veces/);
  });

  it("guarda las filas escritas a mano sin las vacías", () => {
    const rows = manualRows(["Sede", "Horario"], [{ sede: " Centro ", Horario: "8 a 6" }, { Sede: "", Horario: " " }]);
    assert.deepEqual(rows, [{ Sede: "Centro", Horario: "8 a 6" }]);
    assert.throws(() => manualRows(["Sede"], [{ Ciudad: "Pereira" }]), /no tiene/);
  });
});
