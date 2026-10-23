import { z } from "zod";
import { authorize, hasPermission } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { BusinessRuleError } from "@shared/domain/errors";
import { prisma } from "@shared/infrastructure/prisma/client";
import { encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { agendaFrom, isValidTimeZone, type AgendaSettings } from "../domain/agenda";
import { INTEGRATIONS, type IntegrationDefinition } from "../domain/catalog";
import type { CalendarInfo } from "../domain/ports/calendar-provider";
import {
  disconnectGoogle,
  googleCredentials,
  googleRedirectUri,
  ownerKeyFor,
  type ConnectionScope,
  type CredentialsSource,
} from "../infrastructure/google/google-auth";
import { GoogleCalendarProvider } from "../infrastructure/google/google-calendar";
import { acceptsVisits } from "../infrastructure/registry";

/**
 * Integraciones del negocio y de cada usuario:
 * - Conexión del negocio: calendario compartido y Google Sheets. La gestiona quien tenga tenant.settings.
 * - Conexión propia: cada usuario conecta su calendario y decide si recibe visitas.
 * - Credenciales propias: un negocio puede usar su propio proyecto de Google Cloud.
 */

export interface ConnectionDto {
  id: string;
  status: "CONNECTED" | "ERROR" | "DISCONNECTED";
  accountEmail: string | null;
  lastError: string | null;
  connectedAt: string;
  agenda: AgendaSettings;
  acceptsVisits: boolean;
}

export interface TeamMemberDto {
  userId: string;
  name: string;
  email: string;
  connection: Pick<ConnectionDto, "status" | "accountEmail" | "acceptsVisits"> | null;
}

export interface GoogleOverviewDto {
  /** Hay credenciales para conectar (las propias del negocio o las de la plataforma). */
  configured: boolean;
  credentialsSource: CredentialsSource | null;
  /** Client ID propio del negocio, si cargó uno (el secreto nunca sale del servidor). */
  ownClientId: string | null;
  /** URI que hay que registrar en el proyecto de Google Cloud. */
  redirectUri: string;
  /** El usuario puede gestionar la conexión del negocio, las credenciales y ver al equipo. */
  canManage: boolean;
  business: ConnectionDto | null;
  mine: ConnectionDto | null;
  team: TeamMemberDto[];
}

export interface IntegrationsOverviewDto {
  catalog: IntegrationDefinition[];
  google: GoogleOverviewDto;
}

type Row = Awaited<ReturnType<typeof prisma.integration.findMany>>[number];

function toConnection(row: Row): ConnectionDto | null {
  if (row.status === "DISCONNECTED") return null;
  return {
    id: row.id,
    status: row.status,
    accountEmail: row.accountEmail,
    lastError: row.lastError,
    connectedAt: row.updatedAt.toISOString(),
    agenda: agendaFrom(row.settings),
    acceptsVisits: acceptsVisits(row.settings),
  };
}

/** La conexión del negocio la gestiona un administrador; la propia, cualquier miembro activo. */
function requireScope(scope: ConnectionScope) {
  if (scope === "business") authorize("tenant.settings");
  const ctx = TenantContext.require();
  return { ...ctx, ownerKey: ownerKeyFor(scope, ctx.userId) };
}

export class GetIntegrationsUseCase {
  async execute(): Promise<IntegrationsOverviewDto> {
    const { tenantId, userId } = TenantContext.require();
    const canManage = hasPermission("tenant.settings");
    const [creds, own, rows] = await Promise.all([
      googleCredentials(tenantId),
      prisma.integrationApp.findUnique({ where: { tenantId_provider: { tenantId, provider: "GOOGLE" } }, select: { clientId: true } }),
      prisma.integration.findMany({ where: { tenantId, provider: "GOOGLE" } }),
    ]);
    const business = rows.find((r) => r.ownerKey === "business");
    const mine = rows.find((r) => r.ownerKey === ownerKeyFor("user", userId));

    let team: TeamMemberDto[] = [];
    if (canManage) {
      const members = await prisma.membership.findMany({
        where: { tenantId, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      team = members.map((m) => {
        const row = rows.find((r) => r.userId === m.userId);
        const conn = row ? toConnection(row) : null;
        return {
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          connection: conn ? { status: conn.status, accountEmail: conn.accountEmail, acceptsVisits: conn.acceptsVisits } : null,
        };
      });
    }

    return {
      catalog: INTEGRATIONS,
      google: {
        configured: creds !== null,
        credentialsSource: creds?.source ?? null,
        ownClientId: canManage ? own?.clientId ?? null : null,
        redirectUri: googleRedirectUri(),
        canManage,
        business: business ? toConnection(business) : null,
        mine: mine ? toConnection(mine) : null,
        team,
      },
    };
  }
}

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM");

export const connectionSettingsSchema = z
  .object({
    calendarId: z.string().min(1).max(300),
    timeZone: z.string().refine(isValidTimeZone, "Zona horaria inválida"),
    workDays: z.array(z.number().int().min(0).max(6)).min(1, "Elige al menos un día"),
    dayStart: TIME,
    dayEnd: TIME,
    slotMinutes: z.number().int().min(15).max(480),
    minNoticeHours: z.number().int().min(0).max(168),
    /** Solo en el calendario propio: si este usuario recibe visitas. */
    acceptsVisits: z.boolean(),
  })
  .partial()
  .refine((s) => !s.dayStart || !s.dayEnd || s.dayStart < s.dayEnd, "La hora de inicio debe ser antes que la de cierre");

export type ConnectionSettingsInput = z.infer<typeof connectionSettingsSchema>;
/** Compatibilidad con el nombre anterior. */
export type AgendaSettingsInput = ConnectionSettingsInput;

export const scopeSchema = z.enum(["business", "user"]);

async function findConnection(tenantId: string, ownerKey: string) {
  const row = await prisma.integration.findUnique({ where: { tenantId_provider_ownerKey: { tenantId, provider: "GOOGLE", ownerKey } } });
  if (!row || row.status === "DISCONNECTED") throw new BusinessRuleError("Primero conecta la cuenta de Google");
  return row;
}

export class UpdateConnectionSettingsUseCase {
  async execute(scope: ConnectionScope, raw: unknown): Promise<ConnectionDto> {
    const { tenantId, ownerKey } = requireScope(scope);
    const { acceptsVisits: accepts, ...input } = connectionSettingsSchema.parse(raw);
    const row = await findConnection(tenantId, ownerKey);
    const merged = agendaFrom({ ...agendaFrom(row.settings), ...input });
    if (merged.dayStart >= merged.dayEnd) throw new BusinessRuleError("La hora de inicio debe ser antes que la de cierre");
    const visits = scope === "user" ? accepts ?? acceptsVisits(row.settings) : true;
    const updated = await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...merged, acceptsVisits: visits } } });
    return toConnection(updated)!;
  }
}

export class ListCalendarsUseCase {
  async execute(scope: ConnectionScope): Promise<CalendarInfo[]> {
    const { tenantId, ownerKey } = requireScope(scope);
    const row = await findConnection(tenantId, ownerKey);
    return new GoogleCalendarProvider(row.id).listCalendars();
  }
}

export class DisconnectUseCase {
  async execute(scope: ConnectionScope): Promise<void> {
    const { tenantId, ownerKey } = requireScope(scope);
    const row = await prisma.integration.findUnique({ where: { tenantId_provider_ownerKey: { tenantId, provider: "GOOGLE", ownerKey } } });
    if (row) await disconnectGoogle(row.id);
  }
}

export const googleAppSchema = z.object({
  clientId: z
    .string()
    .trim()
    .regex(/^[\w-]+\.apps\.googleusercontent\.com$/, "El Client ID termina en .apps.googleusercontent.com"),
  clientSecret: z.string().trim().min(10, "Pega el secreto del cliente").max(200),
});

/**
 * Los tokens de Google están amarrados a las credenciales con que se crearon: si el negocio las
 * cambia, todas sus conexiones deben reconectarse.
 */
async function invalidateConnections(tenantId: string) {
  await prisma.integration.updateMany({
    where: { tenantId, provider: "GOOGLE", status: { not: "DISCONNECTED" } },
    data: { status: "ERROR", lastError: "Cambiaron las credenciales de Google del negocio. Vuelve a conectar la cuenta." },
  });
}

export class SaveGoogleAppUseCase {
  async execute(raw: unknown): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const input = googleAppSchema.parse(raw);
    const current = await prisma.integrationApp.findUnique({ where: { tenantId_provider: { tenantId, provider: "GOOGLE" } } });
    const data = { clientId: input.clientId, clientSecretEnc: encryptSecret(input.clientSecret) };
    await prisma.integrationApp.upsert({
      where: { tenantId_provider: { tenantId, provider: "GOOGLE" } },
      create: { tenantId, provider: "GOOGLE", ...data },
      update: data,
    });
    if (current?.clientId !== input.clientId) await invalidateConnections(tenantId);
  }
}

export class DeleteGoogleAppUseCase {
  async execute(): Promise<void> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const { count } = await prisma.integrationApp.deleteMany({ where: { tenantId, provider: "GOOGLE" } });
    if (count > 0) await invalidateConnections(tenantId);
  }
}
