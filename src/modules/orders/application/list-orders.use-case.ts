import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import type { Page } from "@shared/domain/repository";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { ListOrdersInput, OrderListItemDto } from "./dtos";

export class ListOrdersUseCase implements UseCase<ListOrdersInput, Page<OrderListItemDto>> {
  async execute(input: ListOrdersInput): Promise<Page<OrderListItemDto>> {
    authorize("orders.read");
    const { tenantId } = TenantContext.require();

    const where = {
      tenantId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            OR: [
              { code: { contains: input.search, mode: "insensitive" as const } },
              { client: { name: { contains: input.search, mode: "insensitive" as const } } },
              { client: { phone: { contains: input.search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { client: true, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((o) => ({
        id: o.id,
        code: o.code,
        clientId: o.clientId,
        clientName: o.client.name,
        clientPhone: o.client.phone,
        status: o.status,
        totalCents: o.totalCents,
        totalMajor: o.totalCents / 100,
        currency: o.currency,
        itemsCount: o._count.items,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
}
