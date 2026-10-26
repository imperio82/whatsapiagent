import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import {
  DEFAULT_REMINDER_TEMPLATES,
  reminderTemplatesFrom,
  type ReminderKindValue,
  type ReminderTemplateKey,
} from "../domain/reminders";
import type { RemindersService } from "./reminders.service";

export const REMINDER_STATUSES = ["PENDING", "SENT", "FAILED", "DISMISSED"] as const;
export type ReminderStatusValue = (typeof REMINDER_STATUSES)[number];
export const REMINDER_KINDS = ["APPOINTMENT", "FOLLOW_UP", "CUSTOM"] as const;

export interface ReminderDto {
  id: string;
  kind: ReminderKindValue;
  status: ReminderStatusValue;
  dueAt: string;
  message: string;
  note: string | null;
  /** Libre: true = sale al cliente; false = tarea del equipo */
  autoSend: boolean;
  error: string | null;
  sentAt: string | null;
  conversationId: string | null;
  client: { id: string; name: string; phone: string };
}

export interface ReminderSettingsDto {
  appointmentReminders: boolean;
  appointmentReminderHours: number;
  appointmentReminderMode: "APPROVAL" | "AUTO";
  followUpEnabled: boolean;
  followUpHours: number;
  followUpMode: "APPROVAL" | "AUTO";
  templates: Record<ReminderTemplateKey, string>;
  defaults: Record<ReminderTemplateKey, string>;
}

export class ListRemindersUseCase {
  async execute(filter: { status?: ReminderStatusValue; kind?: ReminderKindValue }): Promise<ReminderDto[]> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.reminder.findMany({
      where: { tenantId, ...(filter.status ? { status: filter.status } : {}), ...(filter.kind ? { kind: filter.kind } : {}) },
      include: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: filter.status === "PENDING" ? { dueAt: "asc" } : { updatedAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      dueAt: r.dueAt.toISOString(),
      message: r.message,
      note: r.note,
      autoSend: r.autoSend,
      error: r.error,
      sentAt: r.sentAt?.toISOString() ?? null,
      conversationId: r.conversationId,
      client: r.client,
    }));
  }
}

export const createReminderSchema = z.object({
  clientId: z.string().min(1),
  dueAt: z.coerce.date(),
  message: z.string().trim().max(1000).default(""),
  note: z.string().trim().max(500).nullable().optional(),
  autoSend: z.boolean().default(false),
});

export class CreateReminderUseCase {
  constructor(private readonly service: RemindersService) {}

  async execute(raw: unknown): Promise<{ id: string }> {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    const input = createReminderSchema.parse(raw);
    const created = await this.service.create(tenantId, userId, { ...input, note: input.note ?? null });
    return { id: created.id };
  }
}

export const sendReminderSchema = z.object({ message: z.string().trim().min(2).max(1000).optional() });

export class SendReminderUseCase {
  constructor(private readonly service: RemindersService) {}

  execute(id: string, input: z.infer<typeof sendReminderSchema>) {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    return this.service.send(tenantId, id, { userId, message: input.message });
  }
}

export class CompleteReminderUseCase {
  constructor(private readonly service: RemindersService) {}

  execute(id: string) {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    return this.service.complete(tenantId, id, userId);
  }
}

export class DismissReminderUseCase {
  constructor(private readonly service: RemindersService) {}

  execute(id: string) {
    authorize("chats.send");
    const { tenantId, userId } = TenantContext.require();
    return this.service.dismiss(tenantId, id, userId);
  }
}

/** Prepara ya los de citas y seguimiento (útil después de agendar o al activar la función). */
export class PrepareRemindersUseCase {
  constructor(private readonly service: RemindersService) {}

  async execute(): Promise<{ created: number }> {
    authorize("chats.send");
    const { tenantId } = TenantContext.require();
    const now = new Date();
    const created = (await this.service.prepareAppointments(now, tenantId)) + (await this.service.prepareFollowUps(now, tenantId));
    return { created };
  }
}

export class GetReminderSettingsUseCase {
  async execute(): Promise<ReminderSettingsDto> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const t = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        appointmentReminders: true,
        appointmentReminderHours: true,
        appointmentReminderMode: true,
        followUpEnabled: true,
        followUpHours: true,
        followUpMode: true,
        reminderTemplates: true,
      },
    });
    const { reminderTemplates, ...settings } = t;
    return { ...settings, templates: reminderTemplatesFrom(reminderTemplates), defaults: DEFAULT_REMINDER_TEMPLATES };
  }
}

const template = z.string().trim().max(600);
export const reminderSettingsSchema = z.object({
  appointmentReminders: z.boolean().optional(),
  appointmentReminderHours: z.number().int().min(1).max(72).optional(),
  appointmentReminderMode: z.enum(["APPROVAL", "AUTO"]).optional(),
  followUpEnabled: z.boolean().optional(),
  followUpHours: z.number().int().min(1).max(168).optional(),
  followUpMode: z.enum(["APPROVAL", "AUTO"]).optional(),
  templates: z.object({ APPOINTMENT: template, FOLLOW_UP: template }).partial().optional(),
});

export class UpdateReminderSettingsUseCase {
  async execute(raw: unknown): Promise<ReminderSettingsDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const { templates, ...settings } = reminderSettingsSchema.parse(raw);
    const current = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { reminderTemplates: true } });
    // Una plantilla vacía o igual a la de fábrica no se guarda: así hereda las mejoras futuras
    const merged = { ...reminderTemplatesFrom(current.reminderTemplates), ...(templates ?? {}) };
    const custom = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => v && v !== DEFAULT_REMINDER_TEMPLATES[k as ReminderTemplateKey]),
    );
    await prisma.tenant.update({ where: { id: tenantId }, data: { ...settings, reminderTemplates: custom } });
    return new GetReminderSettingsUseCase().execute();
  }
}
