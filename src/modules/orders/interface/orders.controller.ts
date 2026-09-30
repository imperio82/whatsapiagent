import type { Page } from "@shared/domain/repository";
import {
  listOrdersSchema,
  updateStatusSchema,
  type OrderDetailDto,
  type OrderListItemDto,
} from "../application/dtos";
import { GetOrderUseCase } from "../application/get-order.use-case";
import { ListOrdersUseCase } from "../application/list-orders.use-case";
import { UpdateOrderStatusUseCase } from "../application/update-status.use-case";

export class OrdersController {
  private readonly listUC = new ListOrdersUseCase();
  private readonly getUC = new GetOrderUseCase();
  private readonly updateUC = new UpdateOrderStatusUseCase();

  async list(query: URLSearchParams): Promise<Page<OrderListItemDto>> {
    const input = listOrdersSchema.parse(Object.fromEntries(query.entries()));
    return this.listUC.execute(input);
  }

  async get(id: string): Promise<OrderDetailDto> {
    return this.getUC.execute({ id });
  }

  async update(id: string, body: unknown): Promise<OrderDetailDto> {
    const input = updateStatusSchema.parse(body);
    return this.updateUC.execute({ id, ...input });
  }
}
