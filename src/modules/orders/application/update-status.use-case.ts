import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { prisma } from "@shared/infrastructure/prisma/client";
import { assertTransition, type OrderStatus } from "../domain/order-status";
import type { OrderDetailDto, UpdateStatusInput } from "./dtos";
import { GetOrderUseCase } from "./get-order.use-case";

export class UpdateOrderStatusUseCase
  implements UseCase<{ id: string } & UpdateStatusInput, OrderDetailDto>
{
  private readonly getOne = new GetOrderUseCase();

  async execute(input: { id: string } & UpdateStatusInput): Promise<OrderDetailDto> {
    authorize("orders.update");
    const { tenantId } = TenantContext.require();

    const current = await prisma.order.findFirst({
      where: { id: input.id, tenantId },
    });
    if (!current) throw new NotFoundError("Pedido no encontrado");

    assertTransition(current.status as OrderStatus, input.status);

    const now = new Date();
    await prisma.order.update({
      where: { id: input.id },
      data: {
        status: input.status,
        ...(input.status === "PAID" && !current.paidAt ? { paidAt: now } : {}),
        ...(input.status === "DISPATCHED" && !current.dispatchedAt ? { dispatchedAt: now } : {}),
        ...(input.scheduledDeliveryAt !== undefined
          ? { scheduledDeliveryAt: input.scheduledDeliveryAt ? new Date(input.scheduledDeliveryAt) : null }
          : {}),
        ...(input.paymentProofUrl !== undefined ? { paymentProofUrl: input.paymentProofUrl } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    return this.getOne.execute({ id: input.id });
  }
}
