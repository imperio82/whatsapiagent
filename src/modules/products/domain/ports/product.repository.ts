import type { Product } from "../entities/product";
import type { Page } from "@shared/domain/repository";

export interface ProductListFilters {
  tenantId: string;
  search?: string;
  status?: "ACTIVE" | "ARCHIVED";
  page?: number;
  pageSize?: number;
}

export interface ProductRepository {
  findById(tenantId: string, id: string): Promise<Product | null>;
  findBySku(tenantId: string, sku: string): Promise<Product | null>;
  save(product: Product): Promise<Product>;
  list(filters: ProductListFilters): Promise<Page<Product>>;
  delete(tenantId: string, id: string): Promise<void>;
}
