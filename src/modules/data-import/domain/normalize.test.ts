import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  parseAmount,
  parseBoolean,
  parseListingKind,
  parseListingStatus,
  parseMonthDay,
  parseOperation,
  splitUrls,
} from "./normalize";
import { guessMapping, missingRequired } from "./targets";

test("parseAmount entiende precios colombianos y en otros formatos", () => {
  assert.equal(parseAmount("$ 82.000.000"), 82_000_000);
  assert.equal(parseAmount("82000000"), 82_000_000);
  assert.equal(parseAmount("4,500"), 4500);
  assert.equal(parseAmount("4.500"), 4500);
  assert.equal(parseAmount("4.500,50"), 4500.5);
  assert.equal(parseAmount("1,234.5"), 1234.5);
  assert.equal(parseAmount("12.5"), 12.5);
  assert.equal(parseAmount("COP 1.250.000"), 1_250_000);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("a convenir"), null);
});

test("parseListingKind reconoce vehículos e inmuebles escritos a mano", () => {
  assert.equal(parseListingKind("Camioneta"), "VEHICLE");
  assert.equal(parseListingKind("carro particular"), "VEHICLE");
  assert.equal(parseListingKind("Apartamento"), "PROPERTY");
  assert.equal(parseListingKind("Casa campestre"), "PROPERTY");
  assert.equal(parseListingKind("PROPERTY"), "PROPERTY");
  assert.equal(parseListingKind("maquinaria"), "OTHER");
  assert.equal(parseListingKind(""), null);
});

test("parseOperation y parseListingStatus", () => {
  assert.equal(parseOperation("Arriendo"), "RENT");
  assert.equal(parseOperation("venta"), "SALE");
  assert.equal(parseOperation(""), "SALE");
  assert.equal(parseListingStatus("Reservado"), "RESERVED");
  assert.equal(parseListingStatus("vendido"), "SOLD");
  assert.equal(parseListingStatus("Disponible"), "AVAILABLE");
  assert.equal(parseListingStatus(""), null);
});

test("normalizePhone completa el indicativo de Colombia", () => {
  assert.equal(normalizePhone("300 123 4567"), "573001234567");
  assert.equal(normalizePhone("+57 300-123-4567"), "573001234567");
  assert.equal(normalizePhone("0057 3001234567"), "573001234567");
  assert.equal(normalizePhone("+1 (305) 555-0101"), "13055550101");
  assert.equal(normalizePhone("123"), null);
});

test("parseMonthDay acepta los formatos comunes", () => {
  assert.deepEqual(parseMonthDay("15/03/1990"), { month: 3, day: 15, year: 1990 });
  assert.deepEqual(parseMonthDay("1990-03-15"), { month: 3, day: 15, year: 1990 });
  assert.deepEqual(parseMonthDay("15-03"), { month: 3, day: 15, year: null });
  assert.deepEqual(parseMonthDay("15 de marzo de 1990"), { month: 3, day: 15, year: 1990 });
  assert.deepEqual(parseMonthDay("29 Feb"), { month: 2, day: 29, year: null });
  assert.deepEqual(parseMonthDay("32864"), { month: 12, day: 22, year: 1989 });
  assert.equal(parseMonthDay("31/04/1990"), null);
  assert.equal(parseMonthDay("mañana"), null);
});

test("parseBoolean y splitUrls", () => {
  assert.equal(parseBoolean("Sí"), true);
  assert.equal(parseBoolean("inactivo"), false);
  assert.equal(parseBoolean(""), null);
  assert.deepEqual(splitUrls("https://a.co/1.jpg, https://a.co/2.jpg\nno-es-url"), ["https://a.co/1.jpg", "https://a.co/2.jpg"]);
});

test("guessMapping reconoce los encabezados y avisa lo que falta", () => {
  const mapping = guessMapping(["Código", "Nombre del producto", "Precio venta", "Existencias", "Proveedor"], "PRODUCTS");
  assert.deepEqual(mapping, { sku: "Código", name: "Nombre del producto", price: "Precio venta", stock: "Existencias" });
  assert.deepEqual(missingRequired(mapping, "PRODUCTS"), []);

  const clients = guessMapping(["Nombre", "Celular", "Fecha de nacimiento"], "CLIENTS");
  assert.deepEqual(clients, { phone: "Celular", name: "Nombre", birthday: "Fecha de nacimiento" });

  const listings = guessMapping(["Placa", "Vehículo", "Tipo", "Valor", "Ciudad", "Teléfono propietario"], "LISTINGS");
  assert.equal(listings.externalId, "Placa");
  assert.equal(listings.ownerPhone, "Teléfono propietario");
  assert.equal(listings.kind, "Tipo");
});
