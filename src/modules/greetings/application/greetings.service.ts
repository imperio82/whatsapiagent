import { prisma } from "@shared/infrastructure/prisma/client";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { sendProactiveMessage } from "@modules/conversations/application/send-proactive";
import { isGenericClientName } from "@modules/ai/domain/client-memory";
import { localDay } from "@modules/integrations/domain/agenda";
import { monthDayKeys, renderGreeting, templateKeyFor, templatesFrom } from "@modules/clients/domain/special-dates";

/**
 * Felicitaciones de cumpleaños y fechas especiales.
 *
 * Cada día (y el anterior, para que el asesor alcance a revisarlas) se preparan las
 * felicitaciones de las fechas que caen, con el mensaje de la plantilla del negocio:
 * - Modo APPROVAL (por defecto): quedan en el panel → Felicitaciones para aprobar, editar o descartar.
 * - Modo AUTO: salen solas el mismo día, en horario de 9 a. m. a 7 p. m.
 * Lo que no se aprueba en 3 días se descarta solo, para que la bandeja no se llene de fechas viejas.
 */

const TIME_ZONE = "America/Bogota";
const AUTO_HOURS = { from: 9, to: 19 };
const EXPIRE_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

function bogotaHour(date: Date): number {
  return Number(date.toLocaleString("en-US", { timeZone: TIME_ZONE, hour: "numeric", hour12: false })) % 24;
}

/** "2026-10-15" → Date a medianoche UTC, que es como Prisma guarda una columna @db.Date. */
const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

function shortAgentName(name: string | null): string {
  return name?.split(",")[0]?.trim() || "el equipo";
}

export interface GreetingRunResult {
  created: number;
  sent: number;
  expired: number;
}

export class GreetingsService {
  constructor(private readonly whatsapp: WhatsAppProvider) {}

  /** Tarea programada: prepara las de hoy y mañana, envía las automáticas y vence las viejas. */
  async run(now = new Date()): Promise<GreetingRunResult> {
    const today = localDay(now, TIME_ZONE);
    const tomorrow = localDay(new Date(now.getTime() + DAY_MS), TIME_ZONE);
    const createdToday = await this.prepare(today);
    const createdTomorrow = await this.prepare(tomorrow);
    await this.notifyOwners(createdToday, createdTomorrow);
    const sent = await this.sendAutomatic(today, now);
    const expired = await this.expire(today);
    const count = (m: Map<string, string[]>) => [...m.values()].reduce((n, v) => n + v.length, 0);
    return { created: count(createdToday) + count(createdTomorrow), sent, expired };
  }

  /** Crea las felicitaciones de un día que aún no existan. Devuelve, por negocio, a quién se felicita. */
  async prepare(day: string, tenantId?: string): Promise<Map<string, string[]>> {
    const keys = monthDayKeys(day);
    const dates = await prisma.clientDate.findMany({
      where: {
        isActive: true,
        OR: keys,
        client: { greetingsOptOut: false },
        ...(tenantId ? { tenantId } : {}),
        greetings: { none: { occursOn: dayToDate(day) } },
      },
      include: { client: true, tenant: { select: { name: true, aiAgentName: true, greetingTemplates: true, status: true } } },
    });

    const created = new Map<string, string[]>();
    const year = Number(day.slice(0, 4));
    for (const date of dates) {
      if (date.tenant.status !== "ACTIVE") continue;
      const templates = templatesFrom(date.tenant.greetingTemplates);
      const message =
        date.message?.trim() ||
        renderGreeting(templates[templateKeyFor(date)], date, {
          clientName: isGenericClientName(date.client.name) ? null : date.client.name.split(" ")[0]!,
          businessName: date.tenant.name,
          agentName: shortAgentName(date.tenant.aiAgentName),
          year,
        });
      // La restricción única (fecha, día) evita duplicados si dos procesos corren a la vez
      const result = await prisma.greeting.createMany({
        data: [{ tenantId: date.tenantId, clientId: date.clientId, clientDateId: date.id, occursOn: dayToDate(day), message }],
        skipDuplicates: true,
      });
      if (result.count > 0) {
        const who = date.personName ? `${date.personName}, de ${date.client.name}` : date.client.name;
        created.set(date.tenantId, [...(created.get(date.tenantId) ?? []), who]);
      }
    }
    return created;
  }

  private async notifyOwners(today: Map<string, string[]>, tomorrow: Map<string, string[]>): Promise<void> {
    const tenantIds = new Set([...today.keys(), ...tomorrow.keys()]);
    if (tenantIds.size === 0) return;
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [...tenantIds] }, ownerNotifyPhone: { not: null } },
      select: { id: true, ownerNotifyPhone: true, greetingMode: true },
    });
    const list = (names: string[]) => (names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} y ${names.length - 3} más`);
    for (const t of tenants) {
      const parts = [
        today.get(t.id)?.length ? `hoy: ${list(today.get(t.id)!)}` : null,
        tomorrow.get(t.id)?.length ? `mañana: ${list(tomorrow.get(t.id)!)}` : null,
      ].filter(Boolean);
      const action = t.greetingMode === "AUTO" ? "Los mensajes salen solos el día de la fecha; puedes editarlos antes" : "Revisa y aprueba los mensajes";
      const text = `🎂 Fechas especiales de tus clientes (${parts.join(" · ")}). ${action} en el panel → Felicitaciones.`;
      await this.whatsapp.sendText(t.id, { to: t.ownerNotifyPhone!, text }).catch((err) => console.warn("[greetings] aviso al dueño:", err));
    }
  }

  private async sendAutomatic(today: string, now: Date): Promise<number> {
    const hour = bogotaHour(now);
    if (hour < AUTO_HOURS.from || hour >= AUTO_HOURS.to) return 0;
    const due = await prisma.greeting.findMany({
      where: { status: "PENDING", occursOn: dayToDate(today), tenant: { greetingMode: "AUTO", status: "ACTIVE" } },
      select: { id: true, tenantId: true },
      take: 200,
    });
    let sent = 0;
    for (const g of due) {
      const result = await this.send(g.tenantId, g.id, { userId: null }).catch(() => null);
      if (result?.status === "SENT") sent += 1;
    }
    return sent;
  }

  private async expire(today: string): Promise<number> {
    const limit = new Date(dayToDate(today).getTime() - EXPIRE_AFTER_DAYS * DAY_MS);
    const { count } = await prisma.greeting.updateMany({
      where: { status: "PENDING", occursOn: { lt: limit } },
      data: { status: "DISMISSED", error: "Venció sin aprobarse" },
    });
    return count;
  }

  /** Envía una felicitación (la sugerida o la que editó el asesor). */
  async send(
    tenantId: string,
    greetingId: string,
    opts: { userId: string | null; message?: string },
  ): Promise<{ status: "SENT" | "FAILED"; error?: string }> {
    const greeting = await prisma.greeting.findFirst({ where: { id: greetingId, tenantId }, include: { client: true } });
    if (!greeting) throw new NotFoundError("Felicitación no encontrada");
    const text = (opts.message ?? greeting.message).trim();
    if (!text) throw new ValidationError("El mensaje está vacío");

    // Se "reserva" antes de enviar para que dos clics o dos procesos no la envíen dos veces
    const claim = await prisma.greeting.updateMany({
      where: { id: greeting.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENT", message: text, decidedBy: opts.userId, error: null },
    });
    if (claim.count === 0) throw new ValidationError("Esta felicitación ya se envió o se descartó");

    try {
      const { sentAt } = await sendProactiveMessage(this.whatsapp, tenantId, greeting.client, text, opts.userId);
      await prisma.greeting.update({ where: { id: greeting.id }, data: { sentAt } });
      return { status: "SENT" };
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo enviar";
      await prisma.greeting.update({ where: { id: greeting.id }, data: { status: "FAILED", error } });
      return { status: "FAILED", error };
    }
  }

  async dismiss(tenantId: string, greetingId: string, userId: string | null): Promise<void> {
    const { count } = await prisma.greeting.updateMany({
      where: { id: greetingId, tenantId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "DISMISSED", decidedBy: userId },
    });
    if (count === 0) throw new NotFoundError("Felicitación no encontrada o ya enviada");
  }
}
