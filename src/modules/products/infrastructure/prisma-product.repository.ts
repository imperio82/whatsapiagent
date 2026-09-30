import { prisma } from "@shared/infrastructure/prisma/client";
import { Product } from "../domain/entities/product";
import { Money } from "../domain/value-objects/money";
import type { ProductListFilters, ProductRepository } from "../domain/ports/product.repository";
import type { Page } from "@shared/domain/repository";
import type { Product as PrismaProduct } from "@prisma/client";

function toEntity(row: PrismaProduct): Product {
  return Product.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    sku: row.sku,
    name: row.name,
    description: row.description,
    price: Money.fromCents(row.priceCents, row.currency),
    trackInventory: row.trackInventory,
    stock: row.stock,
    imageUrl: row.imageUrl,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaProductRepository implements ProductRepository {
  async findById(tenantId: string, id: string): Promise<Product | null> {
    const row = await prisma.product.findFirst({ where: { id, tenantId } });
    return row ? toEntity(row) : null;
  }

  async findBySku(tenantId: string, sku: string): Promise<Product | null> {
    const row = await prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku } },
    });
    return row ? toEntity(row) : null;
  }

  async save(product: Product): Promise<Product> {
    const s = product.toSnapshot();
    const row = await prisma.product.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        tenantId: s.tenantId,
        sku: s.sku,
        name: s.name,
        description: s.description,
        priceCents: s.price.cents,
        currency: s.price.currency,
        trackInventory: s.trackInventory,
        stock: s.stock,
        imageUrl: s.imageUrl,
        status: s.status,
      },
      update: {
        sku: s.sku,
        name: s.name,
        description: s.description,
        priceCents: s.price.cents,
        currency: s.price.currency,
        trackInventory: s.trackInventory,
        stock: s.stock,
        imageUrl: s.imageUrl,
        status: s.status,
      },
    });
    return toEntity(row);
  }

  async list(filters: ProductListFilters): Promise<Page<Product>> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const where = {
      tenantId: filters.tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { sku: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items: rows.map(toEntity),
      total,
      page,
      pageSize,
    };
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.product.deleteMany({ where: { id, tenantId } });
  }
}
