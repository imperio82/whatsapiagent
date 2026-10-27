import { api } from "./api-client";
import type {
  CreateProductInput,
  ListProductsInput,
  ProductDto,
  UpdateProductInput,
} from "@modules/products/application/dtos";
import type { Page } from "@shared/domain/repository";

function toQuery(input: Partial<ListProductsInput>): string {
  const usp = new URLSearchParams();
  if (input.search) usp.set("search", input.search);
  if (input.status) usp.set("status", input.status);
  if (input.page) usp.set("page", String(input.page));
  if (input.pageSize) usp.set("pageSize", String(input.pageSize));
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const productsService = {
  list(input: Partial<ListProductsInput> = {}): Promise<Page<ProductDto>> {
    return api.get<Page<ProductDto>>(`/api/v1/products${toQuery(input)}`);
  },
  get(id: string): Promise<ProductDto> {
    return api.get<ProductDto>(`/api/v1/products/${id}`);
  },
  create(input: CreateProductInput): Promise<ProductDto> {
    return api.post<ProductDto>("/api/v1/products", input);
  },
  update(id: string, input: UpdateProductInput): Promise<ProductDto> {
    return api.patch<ProductDto>(`/api/v1/products/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/v1/products/${id}`);
  },
};
