import type { Page } from "@shared/domain/repository";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { ListProductsUseCase } from "../application/list-products.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import {
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
  type ProductDto,
} from "../application/dtos";
import { PrismaProductRepository } from "../infrastructure/prisma-product.repository";

export class ProductsController {
  private readonly repo = new PrismaProductRepository();
  private readonly createUC = new CreateProductUseCase(this.repo);
  private readonly listUC = new ListProductsUseCase(this.repo);
  private readonly updateUC = new UpdateProductUseCase(this.repo);
  private readonly deleteUC = new DeleteProductUseCase(this.repo);

  async list(query: URLSearchParams): Promise<Page<ProductDto>> {
    const input = listProductsSchema.parse(Object.fromEntries(query.entries()));
    return this.listUC.execute(input);
  }

  async create(body: unknown): Promise<ProductDto> {
    const input = createProductSchema.parse(body);
    return this.createUC.execute(input);
  }

  async update(id: string, body: unknown): Promise<ProductDto> {
    const input = updateProductSchema.parse(body);
    return this.updateUC.execute({ id, ...input });
  }

  async remove(id: string): Promise<void> {
    return this.deleteUC.execute({ id });
  }
}
