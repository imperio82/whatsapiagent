import { test } from "node:test";
import assert from "node:assert/strict";
import { agendaFrom, canBook, DEFAULT_AGENDA, freeSlots, localDay, zonedToUtc } from "./agenda";

const agenda = { ...DEFAULT_AGENDA, dayStart: "08:00", dayEnd: "12:00", slotMinutes: 60, minNoticeHours: 2 };
// Miércoles 14 de octubre de 2026, 6:00 a. m. en Bogotá (UTC-5)
const now = new Date("2026-10-14T11:00:00Z");

test("zonedToUtc convierte la hora de Bogotá a UTC", () => {
  assert.equal(zonedToUtc("2026-10-16", "15:00", "America/Bogota").toISOString(), "2026-10-16T20:00:00.000Z");
  assert.equal(localDay(new Date("2026-10-17T03:00:00Z"), "America/Bogota"), "2026-10-16");
});

test("zonedToUtc respeta el horario de verano de otras zonas", () => {
  assert.equal(zonedToUtc("2026-07-01", "09:00", "America/New_York").toISOString(), "2026-07-01T13:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01", "09:00", "America/New_York").toISOString(), "2026-12-01T14:00:00.000Z");
});

test("freeSlots devuelve los espacios del horario sin lo ocupado", () => {
  const busy = [{ start: zonedToUtc("2026-10-16", "09:00", agenda.timeZone), end: zonedToUtc("2026-10-16", "10:30", agenda.timeZone) }];
  const slots = freeSlots("2026-10-16", busy, agenda, now).map((s) => s.start.toISOString());
  // 8-9 libre, 9-10 y 10-11 se cruzan con 9:00-10:30, 11-12 libre
  assert.deepEqual(slots, ["2026-10-16T13:00:00.000Z", "2026-10-16T16:00:00.000Z"]);
});

test("freeSlots no ofrece domingos ni días fuera de la agenda", () => {
  assert.deepEqual(freeSlots("2026-10-18", [], agenda, now), []);
  assert.deepEqual(freeSlots("2026-02-30", [], agenda, now), []);
});

test("freeSlots respeta la anticipación mínima", () => {
  // Hoy a las 7:30 a. m.: con 2 horas de anticipación, lo primero es 10:00
  const at = zonedToUtc("2026-10-14", "07:30", agenda.timeZone);
  const slots = freeSlots("2026-10-14", [], agenda, at).map((s) => s.start.toISOString());
  assert.deepEqual(slots, ["2026-10-14T15:00:00.000Z", "2026-10-14T16:00:00.000Z"]);
});

test("canBook explica por qué no se puede", () => {
  const busy = [{ start: zonedToUtc("2026-10-16", "09:00", agenda.timeZone), end: zonedToUtc("2026-10-16", "10:00", agenda.timeZone) }];
  const at = (day: string, time: string) => canBook(zonedToUtc(day, time, agenda.timeZone), busy, agenda, now);
  assert.deepEqual(at("2026-10-16", "08:00"), { ok: true });
  assert.deepEqual(at("2026-10-16", "09:30"), { ok: false, reason: "ocupado" });
  assert.deepEqual(at("2026-10-16", "11:30"), { ok: false, reason: "fuera_de_horario" });
  assert.deepEqual(at("2026-10-18", "09:00"), { ok: false, reason: "dia_no_habil" });
  assert.deepEqual(at("2026-10-14", "07:00"), { ok: false, reason: "fuera_de_horario" });
  // A las 6:30 a. m., las 8:00 quedan a menos de 2 horas
  const early = zonedToUtc("2026-10-14", "06:30", agenda.timeZone);
  assert.deepEqual(canBook(zonedToUtc("2026-10-14", "08:00", agenda.timeZone), [], agenda, early), { ok: false, reason: "muy_pronto" });
  assert.deepEqual(at("2026-10-14", "08:00"), { ok: true });
});

test("agendaFrom completa y valida la configuración guardada", () => {
  assert.deepEqual(agendaFrom(null), DEFAULT_AGENDA);
  const a = agendaFrom({ dayStart: "25:00", slotMinutes: 5, workDays: [5, 1, 1, 9], timeZone: "Marte/Olympus", calendarId: "x@group" });
  assert.equal(a.dayStart, DEFAULT_AGENDA.dayStart);
  assert.equal(a.slotMinutes, DEFAULT_AGENDA.slotMinutes);
  assert.deepEqual(a.workDays, [1, 5]);
  assert.equal(a.timeZone, "America/Bogota");
  assert.equal(a.calendarId, "x@group");
});
