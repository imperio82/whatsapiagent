import type { Product } from "../domain/entities/product";
import type { ProductDto } from "./dtos";

export function toProductDto(p: Product): ProductDto {
  const s = p.toSnapshot();
  return {
    id: s.id,
    sku: s.sku,
    name: s.name,
    description: s.description,
    priceCents: s.price.cents,
    priceMajor: s.price.major,
    currency: s.price.currency,
    trackInventory: s.trackInventory,
    stock: s.stock,
    imageUrl: s.imageUrl,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
