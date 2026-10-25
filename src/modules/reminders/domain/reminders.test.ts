import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REMINDER_TEMPLATES,
  appointmentReminderDue,
  followUpDue,
  reminderTemplatesFrom,
  renderReminder,
  sendsAutomatically,
  withinAutoHours,
} from "./reminders";

const HOUR = 3_600_000;
const now = new Date("2026-10-25T15:00:00Z");

describe("appointmentReminderDue", () => {
  it("recuerda la cita las horas configuradas antes", () => {
    const scheduledAt = new Date(now.getTime() + 48 * HOUR);
    assert.equal(appointmentReminderDue(scheduledAt, 24, now)?.toISOString(), new Date(now.getTime() + 24 * HOUR).toISOString());
  });

  it("si se agendó con poca anticipación, la recuerda ya", () => {
    const scheduledAt = new Date(now.getTime() + 5 * HOUR);
    assert.equal(appointmentReminderDue(scheduledAt, 24, now)?.getTime(), now.getTime());
  });

  it("no recuerda una cita que es en menos de 2 horas o ya pasó", () => {
    assert.equal(appointmentReminderDue(new Date(now.getTime() + HOUR), 24, now), null);
    assert.equal(appointmentReminderDue(new Date(now.getTime() - HOUR), 24, now), null);
  });
});

describe("followUpDue", () => {
  const base = { lastMessageInbound: false, lastInboundAt: new Date(now.getTime() - 30 * HOUR), hours: 20 };

  it("toca cuando el cliente no responde en las horas configuradas", () => {
    assert.equal(followUpDue({ ...base, lastMessageAt: new Date(now.getTime() - 21 * HOUR) }, now), true);
  });

  it("no toca antes de tiempo", () => {
    assert.equal(followUpDue({ ...base, lastMessageAt: new Date(now.getTime() - 5 * HOUR) }, now), false);
  });

  it("no toca si el último mensaje es del cliente (el negocio le debe la respuesta)", () => {
    assert.equal(followUpDue({ ...base, lastMessageInbound: true, lastMessageAt: new Date(now.getTime() - 21 * HOUR) }, now), false);
  });

  it("no toca si el cliente nunca escribió", () => {
    assert.equal(followUpDue({ ...base, lastInboundAt: null, lastMessageAt: new Date(now.getTime() - 21 * HOUR) }, now), false);
  });

  it("no le escribe a silencios viejos", () => {
    assert.equal(followUpDue({ ...base, lastMessageAt: new Date(now.getTime() - 30 * 24 * HOUR) }, now), false);
  });
});

describe("plantillas", () => {
  it("una plantilla vacía hereda la de fábrica", () => {
    const t = reminderTemplatesFrom({ APPOINTMENT: "  ", FOLLOW_UP: "Hola {nombre}" });
    assert.equal(t.APPOINTMENT, DEFAULT_REMINDER_TEMPLATES.APPOINTMENT);
    assert.equal(t.FOLLOW_UP, "Hola {nombre}");
  });

  it("sin nombre del cliente saluda sin la coma suelta", () => {
    assert.equal(renderReminder("Hola, {nombre} 👋 Te escribo de {negocio}.", { "{nombre}": "", "{negocio}": "Eje Autos" }), "Hola 👋 Te escribo de Eje Autos.");
    assert.equal(renderReminder("Hola, {nombre}. ¿Cómo vas?", { "{nombre}": "" }), "Hola. ¿Cómo vas?");
  });
});

describe("envío automático", () => {
  const modes = { appointment: "AUTO", followUp: "APPROVAL" } as const;

  it("citas y seguimiento según el modo del negocio; libres según el asesor", () => {
    assert.equal(sendsAutomatically({ kind: "APPOINTMENT", autoSend: false }, modes), true);
    assert.equal(sendsAutomatically({ kind: "FOLLOW_UP", autoSend: true }, modes), false);
    assert.equal(sendsAutomatically({ kind: "CUSTOM", autoSend: true }, modes), true);
    assert.equal(sendsAutomatically({ kind: "CUSTOM", autoSend: false }, modes), false);
  });

  it("solo los libres salen fuera del horario", () => {
    assert.equal(withinAutoHours("APPOINTMENT", 22), false);
    assert.equal(withinAutoHours("FOLLOW_UP", 10), true);
    assert.equal(withinAutoHours("CUSTOM", 22), true);
  });
});
