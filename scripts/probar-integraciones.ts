/**
 * Prueba de punta a punta (sin Google real ni WhatsApp real) de:
 *  1. Agenda: el agente consulta espacios, agenda, mueve y cancela con un calendario falso en memoria.
 *  2. Importación: Excel y CSV a inventario y clientes, y sincronización desde una base PostgreSQL.
 *  3. Fechas especiales y felicitaciones (aprobación y automático).
 * Usa el negocio "intermediacion-demo" (npm run db:seed:intermediacion) y deja la base como estaba.
 *
 *   npx tsx scripts/probar-integraciones.ts
 *
 * Crea y borra una base temporal `wa_import_check` en el mismo servidor de DATABASE_URL.
 */
import ExcelJS from "exceljs";
import { Client as PgClient } from "pg";
import { prisma } from "@shared/infrastructure/prisma/client";
import { encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import type { CalendarProvider, CalendarEventInput, TimeInterval } from "@modules/integrations/domain/ports/calendar-provider";
import { DEFAULT_AGENDA, zonedToUtc, localDay } from "@modules/integrations/domain/agenda";
import { SchedulingService } from "@modules/integrations/application/scheduling.service";
import { buildBrokerageTools } from "@modules/ai/infrastructure/brokerage-tools";
import { buildTools } from "@modules/ai/infrastructure/tools";
import { readTabularFile } from "@modules/data-import/infrastructure/file-reader";
import { DataSourcesService } from "@modules/data-import/application/data-sources.service";
import { guessMapping } from "@modules/data-import/domain/targets";
import { GreetingsService } from "@modules/greetings/application/greetings.service";

const TZ = "America/Bogota";
const results: string[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  results.push(`${ok ? "✔" : "✘"} ${name}${!ok && detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures += 1;
}

const sent: { to: string; text: string }[] = [];
const fakeWhatsApp: WhatsAppProvider = {
  kind: "meta",
  async start() {},
  async stop() {},
  getState: () => ({ kind: "connected", phoneNumber: "570000000000", connectedAt: new Date() }),
  async sendText(_t, { to, text }) {
    sent.push({ to, text });
    return { providerMessageId: `fake-${Date.now()}-${Math.random()}`, sentAt: new Date() };
  },
  onInbound() {},
};

/** Calendario en memoria con horarios ocupados fijos más los eventos que se creen. */
class FakeCalendar implements CalendarProvider {
  readonly provider = "google";
  events = new Map<string, CalendarEventInput>();
  constructor(private readonly fixedBusy: TimeInterval[]) {}
  async listCalendars() {
    return [{ id: "primary", name: "Principal", primary: true }];
  }
  async busy(_c: string, from: Date, to: Date) {
    const own = [...this.events.values()].map((e) => ({ start: e.start, end: e.end }));
    return [...this.fixedBusy, ...own].filter((b) => b.start < to && b.end > from);
  }
  async createEvent(_c: string, input: CalendarEventInput) {
    const id = `evt-${this.events.size + 1}`;
    this.events.set(id, input);
    return { id, url: `https://calendar.test/${id}` };
  }
  async updateEvent(_c: string, id: string, input: Partial<CalendarEventInput>) {
    this.events.set(id, { ...this.events.get(id)!, ...input });
  }
  async deleteEvent(_c: string, id: string) {
    this.events.delete(id);
  }
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "intermediacion-demo" } });
  const tenantId = tenant.id;
  const original = { greetingMode: tenant.greetingMode, ownerNotifyPhone: tenant.ownerNotifyPhone, listingSeq: tenant.listingSeq };
  const testClient = await prisma.client.create({ data: { tenantId, phone: "573009990099", name: "Prueba Integraciones", source: "test" } });
  const created = { listings: [] as string[], sources: [] as string[], users: [] as string[], integrations: [] as string[] };
  // Conexiones reales (sin tokens) para que las llaves foráneas de las citas se validen de verdad
  const integrationRow = (ownerKey: string, userId: string | null) =>
    prisma.integration.create({ data: { tenantId, provider: "GOOGLE", ownerKey, userId, scopes: ["calendar"], status: "CONNECTED" } });

  try {
    // ------------------------------------------------------------------ 1. Agenda
    const day = localDay(new Date(Date.now() + 2 * 86_400_000), TZ);
    const testDay = new Date(`${day}T12:00:00Z`).getUTCDay() === 0 ? localDay(new Date(Date.now() + 3 * 86_400_000), TZ) : day;
    const calendar = new FakeCalendar([{ start: zonedToUtc(testDay, "09:00", TZ), end: zonedToUtc(testDay, "10:00", TZ) }]);
    const businessRow = await integrationRow("test-negocio", null);
    created.integrations.push(businessRow.id);
    const business = { integrationId: businessRow.id, userId: null, label: "el negocio", calendar, agenda: DEFAULT_AGENDA };
    const scheduling = new SchedulingService({ list: async () => [business], byId: async () => business });
    const ctx = {
      conversationId: "none",
      clientId: testClient.id,
      waChatId: "573009990099@s.whatsapp.net",
      scheduling,
      notifyOwner: async (t: string) => void sent.push({ to: "dueño", text: t }),
    };
    const tools = Object.fromEntries(buildBrokerageTools(tenantId, ctx).map((t) => [t.name, t]));
    check("el agente de intermediación tiene las herramientas nuevas", ["check_availability", "request_visit", "cancel_visit", "save_special_date"].every((n) => n in tools));

    const avail = JSON.parse(await tools.check_availability!.execute({ day: testDay }));
    const starts: string[] = avail.libres.map((s: { dateTime: string }) => s.dateTime);
    check("check_availability: agenda conectada", avail.agenda === "conectada", avail);
    check("check_availability: 9:00 aparece ocupado", !starts.includes(`${testDay}T09:00`) && starts.includes(`${testDay}T08:00`), starts);

    const listing = await prisma.listing.findFirstOrThrow({ where: { tenantId, status: "AVAILABLE", kind: "VEHICLE" } });
    const busyTry = JSON.parse(await tools.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T09:00` }));
    check("request_visit en hora ocupada → no_agendada con alternativas", busyTry.estado === "no_agendada" && busyTry.alternativas.length > 0, busyTry);

    const booked = JSON.parse(await tools.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T15:00`, preferredSlot: "en la tarde" }));
    check("request_visit en hora libre → agendada", booked.estado === "agendada", booked);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { tenantId, clientId: testClient.id } });
    check("la cita queda CONFIRMADA con evento en el calendario", appt.status === "CONFIRMED" && appt.calendarEventId === "evt-1" && calendar.events.size === 1, appt);
    check("el evento lleva el bien y el cliente", calendar.events.get("evt-1")!.title.includes(listing.title) && calendar.events.get("evt-1")!.title.includes("Prueba Integraciones"));

    const moved = JSON.parse(await tools.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T16:00` }));
    const apptMoved = await prisma.appointment.findMany({ where: { tenantId, clientId: testClient.id } });
    check(
      "mover la cita no duplica: misma cita y mismo evento a las 4",
      moved.estado === "agendada" && apptMoved.length === 1 && calendar.events.size === 1 && calendar.events.get("evt-1")!.start.getTime() === zonedToUtc(testDay, "16:00", TZ).getTime(),
      { moved, n: apptMoved.length },
    );

    const cancelled = JSON.parse(await tools.cancel_visit!.execute({ listing: listing.code, reason: "ya compró otro" }));
    const apptCancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    check("cancel_visit cancela y borra el evento", cancelled.estado === "cancelada" && apptCancelled.status === "CANCELLED" && calendar.events.size === 0, cancelled);

    const noCal = new SchedulingService({ list: async () => [], byId: async () => null });
    const tools2 = Object.fromEntries(buildBrokerageTools(tenantId, { ...ctx, scheduling: noCal }).map((t) => [t.name, t]));
    const noCalAvail = JSON.parse(await tools2.check_availability!.execute({ day: testDay }));
    const noCalVisit = JSON.parse(await tools2.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T15:00`, preferredSlot: "jueves tarde" }));
    check("sin calendario: avisa y deja la visita como solicitud", noCalAvail.agenda === "no_conectada" && noCalVisit.estado === "solicitada", { noCalAvail, noCalVisit });

    // ------------------------------------------------------------------ 1b. Varios asesores, cada uno con su calendario
    const [userA, userB] = await Promise.all(
      ["a", "b"].map((x) => prisma.user.create({ data: { email: `zz-asesor-${x}@example.test`, name: x === "a" ? "Ana Asesora" : "Beto Asesor", passwordHash: "x" } })),
    );
    created.users.push(userA!.id, userB!.id);
    const [rowA, rowB] = await Promise.all([integrationRow(`user:${userA!.id}`, userA!.id), integrationRow(`user:${userB!.id}`, userB!.id)]);
    created.integrations.push(rowA!.id, rowB!.id);
    // Ana ocupada de 9 a 10; Beto ocupado de 3 a 4 de la tarde
    const calA = new FakeCalendar([{ start: zonedToUtc(testDay, "09:00", TZ), end: zonedToUtc(testDay, "10:00", TZ) }]);
    const calB = new FakeCalendar([{ start: zonedToUtc(testDay, "15:00", TZ), end: zonedToUtc(testDay, "16:00", TZ) }]);
    const advisors = [
      { integrationId: rowA!.id, userId: userA!.id, label: "Ana Asesora", calendar: calA, agenda: DEFAULT_AGENDA },
      { integrationId: rowB!.id, userId: userB!.id, label: "Beto Asesor", calendar: calB, agenda: DEFAULT_AGENDA },
    ];
    const team = new SchedulingService({ list: async () => advisors, byId: async (_t, id) => advisors.find((a) => a.integrationId === id) ?? null });
    const client2 = await prisma.client.create({ data: { tenantId, phone: "573009990098", name: "Segundo Cliente", source: "test" } });
    const teamTools = (clientId: string) =>
      Object.fromEntries(buildBrokerageTools(tenantId, { ...ctx, clientId, scheduling: team }).map((t) => [t.name, t]));
    const t1 = teamTools(testClient.id);
    const t2 = teamTools(client2.id);

    const teamAvail = JSON.parse(await t1.check_availability!.execute({ day: testDay }));
    const teamStarts: string[] = teamAvail.libres.map((x: { dateTime: string }) => x.dateTime);
    check("equipo: las 9 y las 3 se ofrecen porque siempre hay un asesor libre", teamStarts.includes(`${testDay}T09:00`) && teamStarts.includes(`${testDay}T15:00`), teamStarts);

    const at3 = JSON.parse(await t1.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T15:00` }));
    check("equipo: a las 3 (Beto ocupado) se asigna a Ana", at3.estado === "agendada" && at3.asesor === "Ana Asesora" && calA.events.size === 1 && calB.events.size === 0, at3);
    const at5 = JSON.parse(await t2.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T17:00` }));
    check("equipo: a las 5 (los dos libres) se reparte a Beto, que tiene menos citas", at5.estado === "agendada" && at5.asesor === "Beto Asesor" && calB.events.size === 1, at5);
    const appt2 = await prisma.appointment.findFirstOrThrow({ where: { tenantId, clientId: client2.id } });
    check("equipo: la cita queda asignada al asesor y a su calendario", appt2.assignedUserId === userB!.id && appt2.calendarIntegrationId === rowB!.id, appt2);

    const at9 = JSON.parse(await t1.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T09:00` }));
    const appt1 = await prisma.appointment.findFirstOrThrow({ where: { tenantId, clientId: testClient.id, status: "CONFIRMED" } });
    check(
      "equipo: mover la cita de Ana a las 9 (Ana ocupada) la pasa al calendario de Beto",
      at9.asesor === "Beto Asesor" && calA.events.size === 0 && calB.events.size === 2 && appt1.assignedUserId === userB!.id,
      { at9, a: calA.events.size, b: calB.events.size },
    );
    const at10 = JSON.parse(await t1.request_visit!.execute({ listing: listing.code, dateTime: `${testDay}T10:00` }));
    check("equipo: si su asesor sigue libre a la nueva hora, se queda con él", at10.asesor === "Beto Asesor" && calB.events.size === 2, at10);
    await prisma.appointment.updateMany({ where: { tenantId, clientId: { in: [testClient.id, client2.id] } }, data: { status: "CANCELLED" } });

    // ------------------------------------------------------------------ 3a. La IA guarda fechas
    const retail = Object.fromEntries(buildTools(tenantId, ctx).map((t) => [t.name, t]));
    const saved1 = JSON.parse(await retail.save_special_date!.execute({ kind: "BIRTHDAY", month: 2, day: 30 }));
    check("save_special_date rechaza 30 de febrero", saved1.error === "fecha_invalida", saved1);
    await retail.save_special_date!.execute({ kind: "BIRTHDAY", month: 3, day: 15, year: 1990 });
    await retail.save_special_date!.execute({ kind: "BIRTHDAY", month: 3, day: 16 }); // corrige su cumpleaños
    const today = localDay(new Date(), TZ);
    const [, tm, td] = today.split("-").map(Number) as [number, number, number];
    await tools.save_special_date!.execute({ kind: "BIRTHDAY", month: tm, day: td, personName: "María (esposa)" });
    const dates = await prisma.clientDate.findMany({ where: { clientId: testClient.id }, orderBy: { createdAt: "asc" } });
    check(
      "save_special_date no duplica y corrige",
      dates.length === 2 && dates[0]!.day === 16 && dates[0]!.year === 1990 && dates[1]!.personName === "María (esposa)",
      dates.map((d) => [d.month, d.day, d.year, d.personName]),
    );

    // ------------------------------------------------------------------ 3b. Felicitaciones
    await prisma.tenant.update({ where: { id: tenantId }, data: { greetingMode: "APPROVAL", ownerNotifyPhone: "573001112233" } });
    const greetings = new GreetingsService(fakeWhatsApp);
    sent.length = 0;
    const run1 = await greetings.run(new Date());
    const pending = await prisma.greeting.findMany({ where: { tenantId, clientId: testClient.id } });
    check("modo aprobación: prepara la felicitación y no la envía", pending.length === 1 && pending[0]!.status === "PENDING" && !sent.some((s) => s.to === "573009990099"), { run1, pending });
    check("el mensaje menciona a María y al negocio", /María \(esposa\)/.test(pending[0]?.message ?? "") && pending[0]!.message.includes(tenant.name), pending[0]?.message);
    check("al dueño le llega el aviso", sent.some((s) => s.to === "573001112233" && s.text.includes("Felicitaciones")), sent);
    const run2 = await greetings.run(new Date());
    check("correr de nuevo no duplica", (await prisma.greeting.count({ where: { clientId: testClient.id } })) === 1, run2);

    await prisma.tenant.update({ where: { id: tenantId }, data: { greetingMode: "AUTO" } });
    sent.length = 0;
    await greetings.run(zonedToUtc(today, "12:00", TZ));
    const afterAuto = await prisma.greeting.findFirstOrThrow({ where: { clientId: testClient.id } });
    check("modo automático: se envía en horario hábil", afterAuto.status === "SENT" && sent.some((s) => s.to === "573009990099"), { status: afterAuto.status, sent });
    let double = false;
    try {
      await greetings.send(tenantId, afterAuto.id, { userId: null });
      double = true;
    } catch {
      /* esperado */
    }
    check("no se puede enviar dos veces", !double);
    await prisma.client.update({ where: { id: testClient.id }, data: { greetingsOptOut: true } });
    const optOut = await greetings.prepare(today, tenantId);
    check("cliente que no quiere felicitaciones queda por fuera", !(optOut.get(tenantId) ?? []).some((n) => n.includes("Prueba Integraciones")));

    // ------------------------------------------------------------------ 2a. Excel → inventario
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Inventario");
    ws.addRow(["Placa", "Vehículo", "Tipo", "Valor", "Ciudad", "Barrio", "Año", "Kilometraje", "Teléfono propietario", "Fotos"]);
    ws.addRow(["TEST-AAA111", "Renault Duster 2020", "Camioneta", "$ 62.500.000", "Manizales", "Palermo", 2020, "54.000 km", "3105556677", "https://img.test/1.jpg, https://img.test/2.jpg"]);
    ws.addRow(["TEST-BBB222", "Apartamento La Francia", "Apartamento", "320.000.000", "Manizales", "La Francia", "", "", "", ""]);
    ws.addRow(["TEST-CCC333", "Sin precio", "Carro", "a convenir", "Manizales", "", "", "", "", ""]);
    ws.addRow(["TEST-AAA111", "Duplicado", "Carro", "1", "Manizales", "", "", "", "", ""]);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const table = await readTabularFile(xlsx, "inventario.xlsx");
    const mapping: Record<string, string | string[]> = { ...guessMapping(table.columns, "LISTINGS"), _extra: ["Año", "Kilometraje"] };
    check("Excel: se leen columnas y filas", table.columns.length === 10 && table.rows.length === 4, table.columns);
    check("Excel: el mapeo se adivina", mapping.externalId === "Placa" && mapping.title === "Vehículo" && mapping.price === "Valor" && mapping.ownerPhone === "Teléfono propietario", mapping);

    const importer = new DataSourcesService();
    const r1 = await importer.importRows(tenantId, "LISTINGS", mapping, table);
    check("Excel: 2 creados, 2 con error (precio inválido y repetido)", r1.created === 2 && r1.skipped === 2 && r1.errors.length === 2, r1);
    const duster = await prisma.listing.findUniqueOrThrow({ where: { tenantId_externalId: { tenantId, externalId: "TEST-AAA111" } } });
    check(
      "Excel: precio, tipo, fotos, características y teléfono del propietario",
      duster.priceCop === 62_500_000n && duster.kind === "VEHICLE" && duster.photos.length === 2 && (duster.attributes as Record<string, string>)["Kilometraje"] === "54.000 km" && duster.ownerPhone === "573105556677",
      duster,
    );
    const r2 = await importer.importRows(tenantId, "LISTINGS", mapping, table);
    check("Excel: reimportar actualiza, no duplica", r2.created === 0 && r2.updated === 2, r2);

    // ------------------------------------------------------------------ 2b. CSV (Windows-1252) → clientes con cumpleaños
    const csv = Buffer.from(
      "Nombre;Celular;Fecha de nacimiento;Ciudad\r\nJosé Peña;300 777 8899;15/03/1985;Pereira\r\n\"Ana, la del local\";3007778800;29 de febrero;Manizales\r\nSin número;;01/01/1990;\r\n",
      "latin1",
    );
    const csvTable = await readTabularFile(csv, "clientes.csv");
    const r3 = await importer.importRows(tenantId, "CLIENTS", guessMapping(csvTable.columns, "CLIENTS"), csvTable);
    const jose = await prisma.client.findUnique({ where: { tenantId_phone: { tenantId, phone: "573007778899" } }, include: { dates: true } });
    check("CSV latin1 con ; y comillas: tildes y comas bien leídas", jose?.name === "José Peña" && csvTable.rows[1]!["Nombre"] === "Ana, la del local", { name: jose?.name, row: csvTable.rows[1] });
    check("CSV: cumpleaños guardado y fila sin celular rechazada", r3.created === 2 && r3.skipped === 1 && jose?.dates[0]?.month === 3 && jose?.dates[0]?.day === 15 && jose?.dates[0]?.year === 1985, r3);

    // ------------------------------------------------------------------ 2c. Base PostgreSQL externa → inventario
    const baseUrl = process.env.DATABASE_URL!.split("?")[0]!.replace(/\/[^/]+$/, "");
    const admin = new PgClient({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query("DROP DATABASE IF EXISTS wa_import_check");
    await admin.query("CREATE DATABASE wa_import_check");
    await admin.end();
    const extUrl = `${baseUrl}/wa_import_check`;
    const ext = new PgClient({ connectionString: extUrl });
    await ext.connect();
    await ext.query(`CREATE TABLE inventario (codigo text, nombre text, tipo text, precio numeric, ciudad text, estado text)`);
    await ext.query(`INSERT INTO inventario VALUES ('TEST-DB1','Mazda 3 2019','carro',58000000,'Pereira','disponible'),('TEST-DB2','Casa Cerritos','casa',450000000,'Pereira','reservado')`);
    await ext.end();
    try {
      const source = await prisma.dataSource.create({
        data: {
          tenantId,
          name: "Prueba BD",
          type: "POSTGRES",
          target: "LISTINGS",
          config: { table: "inventario" },
          secretEnc: encryptSecret(extUrl),
          mapping: { externalId: "codigo", title: "nombre", kind: "tipo", price: "precio", city: "ciudad", status: "estado" },
          syncEveryMinutes: 60,
        },
      });
      created.sources.push(source.id);
      const r4 = await importer.sync(tenantId, source.id);
      const casa = await prisma.listing.findUnique({ where: { tenantId_externalId: { tenantId, externalId: "TEST-DB2" } } });
      check("PostgreSQL: sincroniza 2 bienes y respeta el estado", r4.created === 2 && casa?.status === "RESERVED" && casa.kind === "PROPERTY", r4);
      const stored = await prisma.dataSource.findUniqueOrThrow({ where: { id: source.id } });
      check("PostgreSQL: la fuente guarda el resultado", stored.lastStatus === "OK" && (stored.lastResult as { created: number }).created === 2, stored.lastResult);
      const due = await importer.syncDue(new Date());
      check("syncDue no repite antes de su intervalo", due === 0, due);

      let rejected = false;
      try {
        await prisma.dataSource.update({ where: { id: source.id }, data: { config: { table: "inventario; DROP TABLE inventario" } } });
        await importer.sync(tenantId, source.id);
      } catch (err) {
        rejected = /Nombre de tabla inválido/.test((err as Error).message);
      }
      check("tabla con SQL inyectado se rechaza", rejected);
    } finally {
      const admin2 = new PgClient({ connectionString: process.env.DATABASE_URL });
      await admin2.connect();
      await admin2.query("DROP DATABASE IF EXISTS wa_import_check");
      await admin2.end();
    }

    // En producción no se puede apuntar a la red interna
    const prevEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { resolveAllowedHost } = await import("@modules/data-import/infrastructure/host-guard");
    const blocked = await Promise.all(
      ["localhost", "127.0.0.1", "169.254.169.254", "10.0.0.5", "db.railway.internal"].map((h) => resolveAllowedHost(h).then(() => false, () => true)),
    );
    (process.env as Record<string, string>).NODE_ENV = prevEnv!;
    check("producción: bloquea localhost, metadatos y redes privadas", blocked.every(Boolean), blocked);
  } finally {
    // ------------------------------------------------------------------ limpieza
    created.listings.push(...(await prisma.listing.findMany({ where: { tenantId, externalId: { startsWith: "TEST-" } }, select: { id: true } })).map((l) => l.id));
    await prisma.appointment.deleteMany({ where: { tenantId, clientId: testClient.id } });
    await prisma.lead.deleteMany({ where: { tenantId, clientId: testClient.id } });
    await prisma.appointment.deleteMany({ where: { tenantId, client: { phone: "573009990098" } } });
    await prisma.client.deleteMany({ where: { tenantId, phone: { in: ["573009990099", "573009990098", "573007778899", "573007778800"] } } });
    await prisma.integration.deleteMany({ where: { id: { in: created.integrations } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    await prisma.listingMatch.deleteMany({ where: { listingId: { in: created.listings } } });
    await prisma.listing.deleteMany({ where: { tenantId, externalId: { startsWith: "TEST-" } } });
    await prisma.dataSource.deleteMany({ where: { id: { in: created.sources } } });
    await prisma.tenant.update({ where: { id: tenantId }, data: original });
  }

  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
