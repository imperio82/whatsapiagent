import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError, NotFoundError, ValidationError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { isValidMonthDay, type ClientDateKindValue } from "../domain/special-dates";

/**
 * Detalles de un cliente que no son de contacto: sus fechas especiales (y las de su gente),
 * su red de contactos dentro del negocio y si acepta felicitaciones.
 */

export interface ClientDateDto {
  id: string;
  kind: ClientDateKindValue;
  label: string | null;
  personName: string | null;
  month: number;
  day: number;
  year: number | null;
  message: string | null;
  isActive: boolean;
}

export interface ClientRelationDto {
  id: string;
  /** El otro cliente de la relación. */
  other: { id: string; name: string; phone: string };
  /** Cómo se relaciona el otro con este cliente: "Esposa", "Lo refirió"… */
  label: string;
  /** true si la relación se registró desde la ficha del otro cliente. */
  inverse: boolean;
}

export interface ClientDetailsDto {
  clientId: string;
  greetingsOptOut: boolean;
  dates: ClientDateDto[];
  relations: ClientRelationDto[];
}

async function requireClient(tenantId: string, clientId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true, greetingsOptOut: true } });
  if (!client) throw new NotFoundError("Cliente no encontrado");
  return client;
}

export class GetClientDetailsUseCase {
  async execute(clientId: string): Promise<ClientDetailsDto> {
    authorize("clients.read");
    const { tenantId } = TenantContext.require();
    const client = await requireClient(tenantId, clientId);
    const [dates, outgoing, incoming] = await Promise.all([
      prisma.clientDate.findMany({ where: { tenantId, clientId }, orderBy: [{ month: "asc" }, { day: "asc" }] }),
      prisma.clientRelation.findMany({ where: { tenantId, clientId }, include: { related: { select: { id: true, name: true, phone: true } } } }),
      prisma.clientRelation.findMany({ where: { tenantId, relatedClientId: clientId }, include: { client: { select: { id: true, name: true, phone: true } } } }),
    ]);
    return {
      clientId,
      greetingsOptOut: client.greetingsOptOut,
      dates: dates.map(({ id, kind, label, personName, month, day, year, message, isActive }) => ({
        id,
        kind,
        label,
        personName,
        month,
        day,
        year,
        message,
        isActive,
      })),
      relations: [
        ...outgoing.map((r) => ({ id: r.id, other: r.related, label: r.label, inverse: false })),
        ...incoming.map((r) => ({ id: r.id, other: r.client, label: r.label, inverse: true })),
      ],
    };
  }
}

const currentYear = new Date().getFullYear();
export const clientDateSchema = z
  .object({
    kind: z.enum(["BIRTHDAY", "ANNIVERSARY", "CUSTOM"]),
    label: z.string().trim().max(120).nullish(),
    personName: z.string().trim().max(120).nullish(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(currentYear).nullish(),
    message: z.string().trim().max(1000).nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => isValidMonthDay(d.month, d.day), { message: "Ese día no existe en ese mes", path: ["day"] })
  .refine((d) => d.kind === "BIRTHDAY" || Boolean(d.label), { message: "Escribe qué se celebra", path: ["label"] });

export type ClientDateInput = z.infer<typeof clientDateSchema>;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

export class SaveClientDateUseCase {
  async execute(clientId: string, raw: unknown, dateId?: string): Promise<ClientDateDto> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();
    await requireClient(tenantId, clientId);
    const input = clientDateSchema.parse(raw);
    const data = {
      kind: input.kind,
      label: clean(input.label),
      personName: clean(input.personName),
      month: input.month,
      day: input.day,
      year: input.year ?? null,
      message: clean(input.message),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };
    if (dateId) {
      const existing = await prisma.clientDate.findFirst({ where: { id: dateId, tenantId, clientId } });
      if (!existing) throw new NotFoundError("Fecha no encontrada");
      const updated = await prisma.clientDate.update({ where: { id: dateId }, data });
      // Si cambió la fecha, las felicitaciones pendientes de la fecha anterior ya no aplican
      if (existing.month !== updated.month || existing.day !== updated.day) {
        await prisma.greeting.deleteMany({ where: { clientDateId: dateId, status: "PENDING" } });
      }
      return updated;
    }
    return prisma.clientDate.create({ data: { tenantId, clientId, ...data } });
  }
}

export class DeleteClientDateUseCase {
  async execute(clientId: string, dateId: string): Promise<void> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.clientDate.deleteMany({ where: { id: dateId, tenantId, clientId } });
    if (count === 0) throw new NotFoundError("Fecha no encontrada");
  }
}

export const clientRelationSchema = z.object({
  relatedClientId: z.string().min(1),
  label: z.string().trim().min(2).max(60),
});

export class AddClientRelationUseCase {
  async execute(clientId: string, raw: unknown): Promise<ClientRelationDto> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();
    const input = clientRelationSchema.parse(raw);
    if (input.relatedClientId === clientId) throw new ValidationError("Un cliente no se puede relacionar consigo mismo");
    await requireClient(tenantId, clientId);
    const other = await prisma.client.findFirst({ where: { id: input.relatedClientId, tenantId }, select: { id: true, name: true, phone: true } });
    if (!other) throw new NotFoundError("El otro cliente no existe");
    const duplicate = await prisma.clientRelation.findFirst({
      where: {
        tenantId,
        OR: [
          { clientId, relatedClientId: other.id },
          { clientId: other.id, relatedClientId: clientId },
        ],
      },
    });
    if (duplicate) throw new ConflictError("Estos clientes ya están relacionados");
    const relation = await prisma.clientRelation.create({ data: { tenantId, clientId, relatedClientId: other.id, label: input.label } });
    return { id: relation.id, other, label: relation.label, inverse: false };
  }
}

export class DeleteClientRelationUseCase {
  async execute(clientId: string, relationId: string): Promise<void> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.clientRelation.deleteMany({
      where: { id: relationId, tenantId, OR: [{ clientId }, { relatedClientId: clientId }] },
    });
    if (count === 0) throw new NotFoundError("Relación no encontrada");
  }
}

export class SetGreetingsOptOutUseCase {
  async execute(clientId: string, optOut: boolean): Promise<void> {
    authorize("clients.update");
    const { tenantId } = TenantContext.require();
    await requireClient(tenantId, clientId);
    await prisma.client.update({ where: { id: clientId }, data: { greetingsOptOut: optOut } });
    if (optOut) {
      await prisma.greeting.updateMany({ where: { tenantId, clientId, status: "PENDING" }, data: { status: "DISMISSED", error: "El cliente no quiere felicitaciones" } });
    }
  }
}
