import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import { localDay } from "@modules/integrations/domain/agenda";
import {
  DEFAULT_GREETING_TEMPLATES,
  occursOn,
  templatesFrom,
  type ClientDateKindValue,
  type GreetingTemplateKey,
} from "@modules/clients/domain/special-dates";
import type { GreetingsService } from "./greetings.service";

export const GREETING_STATUSES = ["PENDING", "SENT", "FAILED", "DISMISSED"] as const;
export type GreetingStatusValue = (typeof GREETING_STATUSES)[number];

export interface GreetingDto {
  id: string;
  status: GreetingStatusValue;
  occursOn: string; // YYYY-MM-DD
  message: string;
  error: string | null;
  sentAt: string | null;
  client: { id: string; name: string; phone: string };
  date: { kind: ClientDateKindValue; label: string | null; personName: string | null; year: number | null };
}

export interface UpcomingDateDto {
  id: string;
  day: string; // próxima vez que cae, YYYY-MM-DD
  inDays: number;
  kind: ClientDateKindValue;
  label: string | null;
  personName: string | null;
  year: number | null;
  client: { id: string; name: string; greetingsOptOut: boolean };
}

export interface GreetingSettingsDto {
  mode: "APPROVAL" | "AUTO";
  templates: Record<GreetingTemplateKey, string>;
  defaults: Record<GreetingTemplateKey, string>;
}

const TIME_ZONE = "America/Bogota";
const DAY_MS = 86_400_000;

export class ListGreetingsUseCase {
  async execute(status?: GreetingStatusValue): Promise<GreetingDto[]> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.greeting.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { client: { select: { id: true, name: true, phone: true } }, clientDate: true },
      orderBy: status === "PENDING" ? { occursOn: "asc" } : { updatedAt: "desc" },
      take: 200,
    });
    return rows.map((g) => ({
      id: g.id,
      status: g.status,
      occursOn: g.occursOn.toISOString().slice(0, 10),
      message: g.message,
      error: g.error,
      sentAt: g.sentAt?.toISOString() ?? null,
      client: g.client,
      date: { kind: g.clientDate.kind, label: g.clientDate.label, personName: g.clientDate.personName, year: g.clientDate.year },
    }));
  }
}

/** Fechas de los próximos días, para que el asesor se adelante (llamada, detalle, visita). */
export class ListUpcomingDatesUseCase {
  async execute(days = 30): Promise<UpcomingDateDto[]> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const dates = await prisma.clientDate.findMany({
      where: { tenantId, isActive: true },
      include: { client: { select: { id: true, name: true, greetingsOptOut: true } } },
      take: 5000,
    });
    const now = Date.now();
    const result: UpcomingDateDto[] = [];
    for (let i = 0; i <= days; i++) {
      const day = localDay(new Date(now + i * DAY_MS), TIME_ZONE);
      for (const d of dates) {
        if (occursOn(d, day)) {
          result.push({
            id: d.id,
            day,
            inDays: i,
            kind: d.kind,
            label: d.label,
            personName: d.personName,
            year: d.year,
            client: d.client,
          });
        }
      }
    }
    return result.slice(0, 200);
  }
}

export const sendGreetingSchema = z.object({ message: z.string().trim().min(2).max(1000).optional() });

export class SendGreetingUseCase {
  constructor(private readonly service: GreetingsService) {}

  execute(id: string, input: z.infer<typeof sendGreetingSchema>) {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    return this.service.send(tenantId, id, { userId, message: input.message });
  }
}

export class DismissGreetingUseCase {
  constructor(private readonly service: GreetingsService) {}

  execute(id: string) {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    return this.service.dismiss(tenantId, id, userId);
  }
}

/** Prepara ya las de hoy y mañana (útil después de cargar fechas o importar clientes). */
export class PrepareGreetingsUseCase {
  constructor(private readonly service: GreetingsService) {}

  async execute(): Promise<{ created: number }> {
    authorize("chats.send");
    const { tenantId } = TenantContext.require();
    const now = new Date();
    let created = 0;
    for (const day of [localDay(now, TIME_ZONE), localDay(new Date(now.getTime() + DAY_MS), TIME_ZONE)]) {
      const map = await this.service.prepare(day, tenantId);
      created += map.get(tenantId)?.length ?? 0;
    }
    return { created };
  }
}

export class GetGreetingSettingsUseCase {
  async execute(): Promise<GreetingSettingsDto> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { greetingMode: true, greetingTemplates: true } });
    return { mode: tenant.greetingMode, templates: templatesFrom(tenant.greetingTemplates), defaults: DEFAULT_GREETING_TEMPLATES };
  }
}

const template = z.string().trim().max(600);
export const greetingSettingsSchema = z.object({
  mode: z.enum(["APPROVAL", "AUTO"]).optional(),
  templates: z
    .object({ BIRTHDAY: template, BIRTHDAY_OTHER: template, ANNIVERSARY: template, CUSTOM: template })
    .partial()
    .optional(),
});

export class UpdateGreetingSettingsUseCase {
  async execute(raw: unknown): Promise<GreetingSettingsDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const input = greetingSettingsSchema.parse(raw);
    const current = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { greetingTemplates: true } });
    // Una plantilla vacía o igual a la de fábrica no se guarda: así hereda las mejoras futuras
    const merged = { ...templatesFrom(current.greetingTemplates), ...(input.templates ?? {}) };
    const custom = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => v && v !== DEFAULT_GREETING_TEMPLATES[k as GreetingTemplateKey]),
    );
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { ...(input.mode ? { greetingMode: input.mode } : {}), greetingTemplates: custom },
    });
    return new GetGreetingSettingsUseCase().execute();
  }
}
