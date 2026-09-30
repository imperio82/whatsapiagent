import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import type { OrderDetailDto } from "./dtos";

export class GetOrderUseCase implements UseCase<{ id: string }, OrderDetailDto> {
  async execute({ id }: { id: string }): Promise<OrderDetailDto> {
    authorize("orders.read");
    const { tenantId } = TenantContext.require();

    const order = await prisma.order.findFirst({
      where: { id, tenantId },
      include: { client: true, items: true },
    });
    if (!order) throw new NotFoundError("Pedido no encontrado");

    return {
      id: order.id,
      code: order.code,
      client: {
        id: order.client.id,
        name: order.client.name,
        phone: order.client.phone,
      },
      status: order.status,
      totalCents: order.totalCents,
      totalMajor: order.totalCents / 100,
      currency: order.currency,
      paymentProofUrl: order.paymentProofUrl,
      paidAt: order.paidAt?.toISOString() ?? null,
      scheduledDeliveryAt: order.scheduledDeliveryAt?.toISOString() ?? null,
      dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((i) => ({
        id: i.id,
        productNameSnap: i.productNameSnap,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        unitPriceMajor: i.unitPriceCents / 100,
      })),
    };
  }
}
