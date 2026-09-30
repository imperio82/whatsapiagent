import { ValidationError } from "@shared/domain/errors";
import { Money } from "../value-objects/money";

export type ProductStatus = "ACTIVE" | "ARCHIVED";

export interface ProductProps {
  id: string;
  tenantId: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: Money;
  trackInventory: boolean;
  stock: number;
  imageUrl: string | null;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  private constructor(private props: ProductProps) {}

  static create(input: {
    id: string;
    tenantId: string;
    sku?: string | null;
    name: string;
    description?: string | null;
    price: Money;
    trackInventory?: boolean;
    stock?: number;
    imageUrl?: string | null;
  }): Product {
    if (input.name.trim().length < 2) {
      throw new ValidationError("El nombre del producto debe tener al menos 2 caracteres");
    }
    const trackInventory = input.trackInventory ?? true;
    const stock = input.stock ?? 0;
    if (trackInventory && stock < 0) {
      throw new ValidationError("El stock no puede ser negativo");
    }
    const now = new Date();
    return new Product({
      id: input.id,
      tenantId: input.tenantId,
      sku: input.sku ?? null,
      name: input.name.trim(),
      description: input.description ?? null,
      price: input.price,
      trackInventory,
      stock,
      imageUrl: input.imageUrl ?? null,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPersistence(props: ProductProps): Product {
    return new Product(props);
  }

  rename(name: string): void {
    if (name.trim().length < 2) throw new ValidationError("Nombre inválido");
    this.props.name = name.trim();
    this.touch();
  }

  changePrice(price: Money): void {
    this.props.price = price;
    this.touch();
  }

  adjustStock(delta: number): void {
    if (!this.props.trackInventory) return;
    const next = this.props.stock + delta;
    if (next < 0) throw new ValidationError("Stock insuficiente");
    this.props.stock = next;
    this.touch();
  }

  archive(): void {
    this.props.status = "ARCHIVED";
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  toSnapshot(): ProductProps {
    return { ...this.props };
  }
}
