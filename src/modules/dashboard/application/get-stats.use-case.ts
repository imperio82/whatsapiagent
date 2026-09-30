import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";

export interface DashboardStatsDto {
  salesTodayCents: number;
  salesTodayMajor: number;
  currency: string;
  ordersUndispatched: number;
  conversationsUnread: number;
  leadsActive: number;
  recentOrders: Array<{
    id: string;
    code: string;
    clientName: string;
    totalMajor: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  recentChats: Array<{
    id: string;
    clientName: string;
    preview: string;
    unreadCount: number;
    lastMessageAt: string | null;
  }>;
}

export class GetDashboardStatsUseCase implements UseCase<void, DashboardStatsDto> {
  async execute(): Promise<DashboardStatsDto> {
    const { tenantId } = TenantContext.require();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      salesToday,
      ordersUndispatched,
      conversationsUnread,
      leadsActive,
      recentOrdersRaw,
      recentChatsRaw,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: {
          tenantId,
          status: { in: ["PAID", "AWAITING_DISPATCH", "DISPATCHED", "COMPLETED"] },
          paidAt: { gte: startOfToday },
        },
        _sum: { totalCents: true },
      }),
      prisma.order.count({
        where: {
          tenantId,
          status: { in: ["PENDING_PAYMENT", "PAID", "AWAITING_DISPATCH"] },
        },
      }),
      prisma.conversation.count({
        where: { tenantId, unreadCount: { gt: 0 } },
      }),
      prisma.lead.count({
        where: {
          tenantId,
          stage: { in: ["NEW", "CONTACTED", "INTERESTED", "READY_TO_BUY"] },
        },
      }),
      prisma.order.findMany({
        where: { tenantId },
        include: { client: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.conversation.findMany({
        where: { tenantId },
        include: {
          client: true,
          messages: { orderBy: { sentAt: "desc" }, take: 1 },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
      }),
    ]);

    const salesTodayCents = salesToday._sum.totalCents ?? 0;
    const currency = recentOrdersRaw[0]?.currency ?? "GTQ";

    return {
      salesTodayCents,
      salesTodayMajor: salesTodayCents / 100,
      currency,
      ordersUndispatched,
      conversationsUnread,
      leadsActive,
      recentOrders: recentOrdersRaw.map((o) => ({
        id: o.id,
        code: o.code,
        clientName: o.client.name,
        totalMajor: o.totalCents / 100,
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      recentChats: recentChatsRaw.map((c) => ({
        id: c.id,
        clientName: c.client?.name ?? c.waChatId,
        preview: c.messages[0]?.content.slice(0, 80) ?? "",
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      })),
    };
  }
}
