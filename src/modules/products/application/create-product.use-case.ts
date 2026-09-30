import { randomUUID } from "node:crypto";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { ConflictError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { Product } from "../domain/entities/product";
import { Money } from "../domain/value-objects/money";
import type { ProductRepository } from "../domain/ports/product.repository";
import type { CreateProductInput, ProductDto } from "./dtos";
import { toProductDto } from "./mapper";

export class CreateProductUseCase implements UseCase<CreateProductInput, ProductDto> {
  constructor(private readonly repo: ProductRepository) {}

  async execute(input: CreateProductInput): Promise<ProductDto> {
    authorize("products.create");
    const { tenantId } = TenantContext.require();

    if (input.sku) {
      const existing = await this.repo.findBySku(tenantId, input.sku);
      if (existing) throw new ConflictError("Ya existe un producto con ese SKU");
    }

    const product = Product.create({
      id: randomUUID(),
      tenantId,
      sku: input.sku ?? null,
      name: input.name,
      description: input.description ?? null,
      price: Money.fromMajor(input.priceMajor, input.currency),
      trackInventory: input.trackInventory,
      stock: input.stock,
      imageUrl: input.imageUrl ?? null,
    });

    const saved = await this.repo.save(product);
    return toProductDto(saved);
  }
}
