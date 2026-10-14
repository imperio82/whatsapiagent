import { prisma } from "@shared/infrastructure/prisma/client";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import type { WhatsAppProvider } from "@modules/whatsapp/domain/ports/whatsapp-provider";
import { scoreMatch, suggestedMessage, type MatchListing } from "../domain/match";

/**
 * Coincidencias inventario ↔ compradores.
 *
 * Cuando un bien queda disponible (se crea, se aprueba o se reactiva) se cruza con los
 * compradores abiertos. Cada coincidencia queda como propuesta con un mensaje sugerido:
 * - Modo APPROVAL (por defecto): el asesor la revisa en el panel y decide si se envía.
 * - Modo AUTO: se envía sola, pero solo en horario hábil y máximo un aviso por cliente al día;
 *   las demás quedan esperando aprobación.
 */

/** Horario en que salen los avisos automáticos (hora de Colombia). */
const AUTO_HOURS = { from: 8, to: 19 };
/** Un cliente recibe como máximo un aviso de este tipo por día. */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MATCHES_PER_LISTING = 30;

function bogotaHour(date = new Date()): number {
  return Number(date.toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })) % 24;
}

function toMatchListing(l: {
  kind: MatchListing["kind"];
  operation: MatchListing["operation"];
  title: string;
  description: string | null;
  priceCop: bigint;
  city: string;
  zone: string | null;
  attributes: unknown;
}): MatchListing {
  const attributes =
    l.attributes && typeof l.attributes === "object" && !Array.isArray(l.attributes)
      ? Object.fromEntries(Object.entries(l.attributes).map(([k, v]) => [k, String(v)]))
      : {};
  return { ...l, priceCop: Number(l.priceCop), attributes };
}

function wantsOf(qualification: unknown, productInterest: string | null): string | null {
  if (qualification && typeof qualification === "object" && !Array.isArray(qualification)) {
    const busca = (qualification as Record<string, unknown>).busca;
    if (typeof busca === "string" && busca.trim()) return busca.trim();
  }
  return productInterest;
}

/** "Valentina, asesora virtual de X" → "Valentina", para no repetir el nombre del negocio en el mensaje. */
function shortAgentName(name: string | null): string {
  return name?.split(",")[0]?.trim() || "el equipo";
}

export interface MatchRunResult {
  created: number;
  sent: number;
}

export class MatchingService {
  constructor(private readonly whatsapp: WhatsAppProvider) {}

  /** Busca compradores para un bien disponible y crea las propuestas que no existan. */
  async findMatchesForListing(tenantId: string, listingId: string): Promise<MatchRunResult> {
    const [tenant, listing] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.listing.findFirst({ where: { id: listingId, tenantId } }),
    ]);
    if (!tenant || !listing) throw new NotFoundError("Bien no encontrado");
    if (listing.status !== "AVAILABLE") return { created: 0, sent: 0 };

    const [buyers, existing] = await Promise.all([
      prisma.lead.findMany({
        where: {
          tenantId,
          leadType: "BUYER",
          stage: { notIn: ["CUSTOMER", "LOST"] },
          clientId: { not: null },
          OR: [{ listingId: null }, { listingId: { not: listing.id } }],
        },
        include: { client: { select: { name: true } } },
      }),
      prisma.listingMatch.findMany({ where: { listingId: listing.id }, select: { leadId: true } }),
    ]);
    const already = new Set(existing.map((m) => m.leadId));
    const target = toMatchListing(listing);

    const candidates = buyers
      .filter((b) => !already.has(b.id))
      .map((b) => {
        const wants = wantsOf(b.qualification, b.productInterest);
        const result = scoreMatch(target, {
          searchKind: b.searchKind,
          searchOperation: b.searchOperation,
          budgetMaxCop: b.budgetMaxCop === null ? null : Number(b.budgetMaxCop),
          searchCity: b.searchCity,
          wants,
        });
        return result ? { lead: b, wants, ...result } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      // Primero los compradores más calientes y con más puntaje
      .sort((a, b) => b.score - a.score || tempRank(b.lead.temperature) - tempRank(a.lead.temperature))
      .slice(0, MAX_MATCHES_PER_LISTING);

    if (candidates.length === 0) return { created: 0, sent: 0 };

    const created = await prisma.$transaction(
      candidates.map((c) =>
        prisma.listingMatch.create({
          data: {
            tenantId,
            listingId: listing.id,
            leadId: c.lead.id,
            score: c.score,
            reasons: c.reasons.join(" · "),
            message: suggestedMessage({
              clientName: c.lead.client?.name && !/^Cliente \d+$/.test(c.lead.client.name) ? c.lead.client.name : null,
              agentName: shortAgentName(tenant.aiAgentName),
              businessName: tenant.name,
              listing: target,
              wants: c.wants,
            }),
          },
        }),
      ),
    );

    let sent = 0;
    if (tenant.matchAlertMode === "AUTO") {
      const hour = bogotaHour();
      if (hour >= AUTO_HOURS.from && hour < AUTO_HOURS.to) {
        for (const match of created) {
          const lead = candidates.find((c) => c.lead.id === match.leadId)!.lead;
          if (await this.recentlyAlerted(tenantId, lead.clientId!)) continue;
          const result = await this.send(tenantId, match.id, { userId: null }).catch(() => null);
          if (result?.status === "SENT") sent += 1;
        }
      }
    }

    const pending = created.length - sent;
    if (pending > 0 && tenant.ownerNotifyPhone) {
      const text =
        `🎯 ${pending} comprador${pending === 1 ? "" : "es"} podría${pending === 1 ? "" : "n"} estar interesado${pending === 1 ? "" : "s"} en ${listing.title} (${listing.code}). ` +
        `Revisa y aprueba los mensajes en el panel → Coincidencias.`;
      await this.whatsapp.sendText(tenantId, { to: tenant.ownerNotifyPhone, text }).catch((err) =>
        console.warn("[matching] no se pudo avisar al dueño:", err),
      );
    }
    return { created: created.length, sent };
  }

  /** Envía el mensaje de una coincidencia (el sugerido o el que editó el asesor). */
  async send(
    tenantId: string,
    matchId: string,
    opts: { userId: string | null; message?: string },
  ): Promise<{ status: "SENT" | "FAILED"; error?: string }> {
    const match = await prisma.listingMatch.findFirst({
      where: { id: matchId, tenantId },
      include: { lead: { include: { client: true } }, listing: true },
    });
    if (!match) throw new NotFoundError("Coincidencia no encontrada");
    if (match.status === "SENT") throw new ValidationError("Este mensaje ya se envió");
    const client = match.lead.client;
    if (!client) throw new ValidationError("El comprador no tiene un cliente de WhatsApp asociado");

    const text = (opts.message ?? match.message).trim();
    if (!text) throw new ValidationError("El mensaje está vacío");

    const conversation = await prisma.conversation.findFirst({
      where: { tenantId, clientId: client.id },
      orderBy: { lastMessageAt: "desc" },
    });
    const to = conversation?.waChatId ?? client.phone;

    try {
      const sent = await this.whatsapp.sendText(tenantId, { to, text });
      await prisma.$transaction([
        prisma.listingMatch.update({
          where: { id: match.id },
          data: { status: "SENT", message: text, sentAt: sent.sentAt, decidedBy: opts.userId, error: null },
        }),
        prisma.lead.update({ where: { id: match.leadId }, data: { lastContactAt: sent.sentAt } }),
        ...(conversation
          ? [
              prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  waMessageId: sent.providerMessageId,
                  direction: "OUTBOUND",
                  type: "TEXT",
                  content: text,
                  authoredBy: opts.userId ? "AGENT" : "SYSTEM",
                  agentUserId: opts.userId,
                  sentAt: sent.sentAt,
                },
              }),
              prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: sent.sentAt } }),
            ]
          : []),
      ]);
      return { status: "SENT" };
    } catch (err) {
      const error = err instanceof Error ? err.message : "No se pudo enviar";
      await prisma.listingMatch.update({
        where: { id: match.id },
        data: { status: "FAILED", message: text, error, decidedBy: opts.userId },
      });
      return { status: "FAILED", error };
    }
  }

  async dismiss(tenantId: string, matchId: string, userId: string | null): Promise<void> {
    const { count } = await prisma.listingMatch.updateMany({
      where: { id: matchId, tenantId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "DISMISSED", decidedBy: userId },
    });
    if (count === 0) throw new NotFoundError("Coincidencia no encontrada o ya enviada");
  }

  private async recentlyAlerted(tenantId: string, clientId: string): Promise<boolean> {
    const last = await prisma.listingMatch.findFirst({
      where: { tenantId, status: "SENT", sentAt: { gte: new Date(Date.now() - ONE_DAY_MS) }, lead: { clientId } },
      select: { id: true },
    });
    return last !== null;
  }
}

function tempRank(t: "HOT" | "WARM" | "COLD" | null): number {
  return t === "HOT" ? 3 : t === "WARM" ? 2 : t === "COLD" ? 1 : 0;
}
