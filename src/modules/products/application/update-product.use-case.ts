import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { Money } from "../domain/value-objects/money";
import type { ProductRepository } from "../domain/ports/product.repository";
import type { ProductDto, UpdateProductInput } from "./dtos";
import { toProductDto } from "./mapper";

export interface UpdateProductCommand extends UpdateProductInput {
  id: string;
}

export class UpdateProductUseCase implements UseCase<UpdateProductCommand, ProductDto> {
  constructor(private readonly repo: ProductRepository) {}

  async execute(cmd: UpdateProductCommand): Promise<ProductDto> {
    authorize("products.update");
    const { tenantId } = TenantContext.require();

    const product = await this.repo.findById(tenantId, cmd.id);
    if (!product) throw new NotFoundError("Producto no encontrado");

    if (cmd.name !== undefined) product.rename(cmd.name);
    if (cmd.priceMajor !== undefined) {
      product.changePrice(Money.fromMajor(cmd.priceMajor, cmd.currency ?? product.toSnapshot().price.currency));
    }
    if (cmd.status === "ARCHIVED") product.archive();

    const saved = await this.repo.save(product);
    return toProductDto(saved);
  }
}
