import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import type { ProductRepository } from "../domain/ports/product.repository";

export class DeleteProductUseCase implements UseCase<{ id: string }, void> {
  constructor(private readonly repo: ProductRepository) {}

  async execute({ id }: { id: string }): Promise<void> {
    authorize("products.delete");
    const { tenantId } = TenantContext.require();
    await this.repo.delete(tenantId, id);
  }
}
