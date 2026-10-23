import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GREETING_TEMPLATES,
  isValidMonthDay,
  monthDayKeys,
  occursOn,
  renderGreeting,
  templateKeyFor,
  templatesFrom,
  type SpecialDate,
} from "./special-dates";

const birthday = (extra: Partial<SpecialDate> = {}): SpecialDate => ({
  kind: "BIRTHDAY",
  month: 3,
  day: 15,
  year: null,
  label: null,
  personName: null,
  ...extra,
});
const ctx = { clientName: "Carlos", businessName: "Eje Autos & Hogar", agentName: "Valentina", year: 2026 };

test("occursOn: mismo mes y día", () => {
  assert.equal(occursOn({ month: 3, day: 15 }, "2026-03-15"), true);
  assert.equal(occursOn({ month: 3, day: 15 }, "2026-03-16"), false);
});

test("el 29 de febrero se celebra el 28 en años no bisiestos", () => {
  assert.equal(occursOn({ month: 2, day: 29 }, "2026-02-28"), true);
  assert.equal(occursOn({ month: 2, day: 29 }, "2028-02-28"), false);
  assert.equal(occursOn({ month: 2, day: 29 }, "2028-02-29"), true);
  assert.deepEqual(monthDayKeys("2026-02-28"), [{ month: 2, day: 28 }, { month: 2, day: 29 }]);
  assert.deepEqual(monthDayKeys("2028-02-28"), [{ month: 2, day: 28 }]);
});

test("isValidMonthDay", () => {
  assert.equal(isValidMonthDay(2, 29), true);
  assert.equal(isValidMonthDay(4, 31), false);
  assert.equal(isValidMonthDay(13, 1), false);
});

test("plantilla según si la fecha es del cliente o de alguien de su círculo", () => {
  assert.equal(templateKeyFor(birthday()), "BIRTHDAY");
  assert.equal(templateKeyFor(birthday({ personName: "María (esposa)" })), "BIRTHDAY_OTHER");
  assert.equal(templateKeyFor(birthday({ kind: "ANNIVERSARY" })), "ANNIVERSARY");
});

test("renderGreeting llena los datos", () => {
  const text = renderGreeting(DEFAULT_GREETING_TEMPLATES.BIRTHDAY_OTHER, birthday({ personName: "María (esposa)" }), ctx);
  assert.match(text, /^Hola, Carlos\. Hoy está de cumpleaños María \(esposa\)/);
  assert.match(text, /Eje Autos & Hogar/);
});

test("renderGreeting sin nombre del cliente no deja comas sueltas", () => {
  const text = renderGreeting(DEFAULT_GREETING_TEMPLATES.BIRTHDAY, birthday(), { ...ctx, clientName: null });
  assert.match(text, /^¡Feliz cumpleaños! 🎉/);
});

test("renderGreeting calcula los años", () => {
  const text = renderGreeting("Cumple {años} años", birthday({ year: 1990 }), ctx);
  assert.equal(text, "Cumple 36 años");
});

test("templatesFrom usa las del negocio y completa con las de fábrica", () => {
  const t = templatesFrom({ BIRTHDAY: "  Feliz día {nombre}  ", CUSTOM: "", OTRA: "x" });
  assert.equal(t.BIRTHDAY, "Feliz día {nombre}");
  assert.equal(t.CUSTOM, DEFAULT_GREETING_TEMPLATES.CUSTOM);
});
