import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spokenPrice, spokenText } from "./spoken-text";

describe("texto para leer en voz alta", () => {
  it("convierte cada línea del chat en una frase con su puntuación", () => {
    assert.equal(
      spokenText("¡Hola Juan! 😊\nTengo dos opciones en Pinares\n- *Apartamento* de 3 hab, 85 m2\n- Casa con patio\n¿Cuál le gustaría visitar"),
      "¡Hola Juan! Tengo dos opciones en Pinares. Apartamento de 3 habitaciones, 85 metros cuadrados. Casa con patio. ¿Cuál le gustaría visitar?",
    );
  });

  it("respeta la puntuación que ya trae y las listas numeradas", () => {
    assert.equal(spokenText("Estas son las opciones:\n1. Casa\n2) Lote"), "Estas son las opciones: Casa. Lote.");
    assert.equal(spokenText("¡Listo! ✅ *Quedó* tu pedido ☕"), "¡Listo! Quedó tu pedido.");
    assert.equal(spokenText("¡Qué bien"), "¡Qué bien!");
  });

  it("dice los precios como se pronuncian", () => {
    assert.equal(spokenPrice("350.000.000"), "350 millones de pesos");
    assert.equal(spokenPrice("1.250.000"), "un millón 250 mil pesos");
    assert.equal(spokenPrice("45.900"), "45 mil 900 pesos");
    assert.equal(spokenPrice("1.000"), "mil pesos");
    assert.equal(spokenText("Vale $350.000.000 COP"), "Vale 350 millones de pesos.");
    assert.equal(spokenText("El arriendo es de $ 1.800.000"), "El arriendo es de un millón 800 mil pesos.");
  });

  it("escribe completas las abreviaturas de direcciones y medidas", () => {
    assert.equal(spokenText("Queda en la Cra 15 # 20-30"), "Queda en la carrera 15 número 20-30.");
    assert.equal(spokenText("A 2 km del centro, aprox 1 hab"), "A 2 kilómetros del centro, aproximadamente 1 habitación.");
    assert.equal(spokenText("Interés del 12%"), "Interés del 12 por ciento.");
  });
});
