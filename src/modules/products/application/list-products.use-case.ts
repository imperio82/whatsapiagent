import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import type { UseCase } from "@shared/domain/use-case";
import type { Page } from "@shared/domain/repository";
import type { ProductRepository } from "../domain/ports/product.repository";
import type { ListProductsInput, ProductDto } from "./dtos";
import { toProductDto } from "./mapper";

export class ListProductsUseCase implements UseCase<ListProductsInput, Page<ProductDto>> {
  constructor(private readonly repo: ProductRepository) {}

  async execute(input: ListProductsInput): Promise<Page<ProductDto>> {
    authorize("products.read");
    const { tenantId } = TenantContext.require();

    const page = await this.repo.list({
      tenantId,
      search: input.search,
      status: input.status,
      page: input.page,
      pageSize: input.pageSize,
    });

    return {
      items: page.items.map(toProductDto),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
}
